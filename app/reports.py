"""Situation-report generation.

Two kinds of content go into every report, kept visibly separate:
  * DATA sections (snapshot, top incidents) - computed straight from the
    database. These never depend on the LLM, so a report is always useful
    even if the model is down.
  * the AI ASSESSMENT - the existing RAG brief (app/intelligence/rag.py),
    shown together with its reliability checks in plain language. If the LLM
    fails or its output fails validation, the report says so instead of
    quietly omitting it or inventing text.

Reports are stored as markdown: the same text is displayed on screen and fed
to the PDF/DOCX exporters (app/export.py).

build_report() is a pure function (no database, no LLM) so it is unit-tested.
"""

import re
from datetime import datetime, timezone

REPORT_TYPES = {
    # type -> (title, audience role passed to the brief, how many top incidents to list)
    "situation": ("Situation Report", "operator", 10),
    "executive": ("Executive Brief", "executive", 5),
    "regional": ("Regional Focus Report", "analyst", 10),
}

BRIEF_QUERIES = {
    "situation": "current most severe hazards worldwide and the recommended response",
    "executive": "overall global crisis situation and strategic implications",
}


def brief_query_for(report_type: str, scope: str | None) -> str:
    if report_type == "regional" and scope:
        return f"hazard situation in {scope}"
    return BRIEF_QUERIES.get(report_type, BRIEF_QUERIES["situation"])


def _clean(text: object) -> str:
    """Feed text (e.g. GDELT headlines) can contain markdown punctuation that
    would break our own formatting - strip it rather than try to escape it."""
    return re.sub(r"[\\*_\[\]`<>#]", "", str(text)).replace("\n", " ").strip()


def _safe_url(url: str) -> str:
    return url.replace("(", "%28").replace(")", "%29").replace(" ", "%20")


def describe_guardrails(brief: dict) -> list[str]:
    """The technical guardrail metrics, in plain language for non-technical
    readers (a checklist item). Same logic is mirrored in the frontend's
    fact-check panel so wording stays consistent."""
    pct = round(float(brief.get("grounding_score", 0.0)) * 100)
    # Bands mirror frontend/lib/guardrails.ts (20% = the backend's alert floor).
    band = "strong" if pct >= 50 else "partial" if pct >= 20 else "weak"
    lines = [f"Wording matches the source data ({band}): {pct}% of the AI's key words appear in the retrieved records."]
    lines.append(
        "Numbers and dates verified: every number and month named in the AI text appears in the source records."
        if brief.get("numbers_grounded")
        else "Numbers or dates NOT verified: the AI text contains a number or month that is not in the source records - check before use."
    )
    lines.append(
        "Alert levels consistent: the alert levels the AI mentions match the source records."
        if brief.get("domain_constraints_ok")
        else "Alert levels NOT consistent: the AI text mentions an alert level not present in the source records - check before use."
    )
    return lines


def in_scope(ranked: list[dict], scope: str | None) -> list[dict]:
    """Active (not analyst-dismissed) incidents, narrowed to `scope` if given.
    Also used by the endpoint to skip the slow LLM call when nothing matches."""
    items = [r for r in ranked if r.get("status", "active") != "dismissed"]
    scope = (scope or "").strip().lower()
    if scope:
        items = [i for i in items if scope in i["location_name"].lower() or scope in i["hazard_type"].lower()]
    return items


def build_report(
    report_type: str,
    scope: str | None,
    ranked: list[dict],
    brief: dict | None,
    actor: str,
    now: datetime | None = None,
) -> tuple[str, str, bool]:
    """Returns (title, markdown, ai_included).

    `ranked` = rank_hazards() output, each item also carrying a "url".
    `brief` = generate_brief() output, or None if it wasn't (or couldn't be) run.
    """
    base_title, _role, top_n = REPORT_TYPES[report_type]
    now = now or datetime.now(timezone.utc)
    scope = (scope or "").strip() or None

    items = in_scope(ranked, scope)

    title = f"{base_title}: {_clean(scope)}" if scope else base_title
    by_level = {lvl: sum(1 for i in items if i["alert_level"] == lvl) for lvl in ("Red", "Orange", "Green")}
    confirmed = sum(1 for i in items if i.get("validated"))

    out: list[str] = [f"# {title}", ""]
    stamp = now.strftime("%Y-%m-%d %H:%M UTC")
    out.append(f"*Generated {stamp} by {_clean(actor)}. Early-warning decision support: verify before acting.*")
    out.append("")

    out += ["## Situation snapshot", ""]
    out.append(f"- Active incidents{' matching ' + _clean(scope) if scope else ''}: {len(items)}")
    out.append(f"- Red alerts: {by_level['Red']}, Orange: {by_level['Orange']}, Green: {by_level['Green']}")
    out.append(f"- Analyst-confirmed: {confirmed}")
    out.append("")

    if not items:
        out += ["No active incidents were found for this scope.", ""]
        return title, "\n".join(out).rstrip() + "\n", False

    out += [f"## Top {min(top_n, len(items))} incidents by priority", ""]
    for n, i in enumerate(items[:top_n], start=1):
        label = i["hazard_type"].replace("_", " ").title()
        flags = []
        if i.get("validated"):
            flags.append("analyst-confirmed")
        if i.get("severity_overridden"):
            flags.append("severity set by analyst")
        flag_txt = f" ({', '.join(flags)})" if flags else ""
        line = (
            f"{n}. **{_clean(label)}**: {_clean(i['location_name'])}. "
            f"{i['priority_label']} priority ({i['priority_score']:.0f}/100), {i['alert_level']} alert, "
            f"source {_clean(i['source'])}{flag_txt}."
        )
        if i.get("url"):
            line += f" [Open source]({_safe_url(i['url'])})"
        out.append(line)
    out.append("")

    ai_included = False
    out += ["## AI assessment", ""]
    structured = brief.get("structured_brief") if brief else None
    if brief and brief.get("schema_valid") and structured:
        ai_included = True
        out.append(_clean(structured["executive_summary"]))
        out.append("")
        if structured.get("key_impacts"):
            out += ["### Key impacts", ""] + [f"- {_clean(x)}" for x in structured["key_impacts"]] + [""]
        if structured.get("recommendations"):
            out += ["### Recommended actions", ""] + [f"- {_clean(x)}" for x in structured["recommendations"]] + [""]
        out += ["### Reliability checks", ""] + [f"- {line}" for line in describe_guardrails(brief)] + [""]

        urls = {i["id"]: i.get("url") for i in ranked}
        sources = brief.get("sources") or []
        if sources:
            out += ["### Records the AI was given", ""]
            for s in sources:
                text = _clean(s.get("summary", ""))[:140]
                url = urls.get(s.get("id"))
                out.append(f"- [{text}]({_safe_url(url)})" if url else f"- {text}")
            out.append("")
    else:
        out.append(
            "The AI assessment is unavailable for this report (the language model could not be reached, "
            "or its answer failed validation). The data sections above are unaffected."
        )
        out.append("")

    return title, "\n".join(out).rstrip() + "\n", ai_included

from datetime import datetime, timezone

from app.reports import brief_query_for, build_report, describe_guardrails

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)


def item(id_, loc, level="Red", score=85.0, label="Critical", status="active", validated=False,
         overridden=False, url="https://example.org/e", hazard_type="earthquake", source="usgs"):
    return {
        "id": id_, "hazard_type": hazard_type, "location_name": loc, "alert_level": level,
        "source": source, "timestamp": NOW, "priority_score": score, "priority_label": label,
        "severity_overridden": overridden, "status": status, "validated": validated,
        "reviewed_by": None, "url": url,
    }


GOOD_BRIEF = {
    "schema_valid": True,
    "structured_brief": {
        "executive_summary": "A major quake struck near Testville.",
        "key_impacts": ["Possible structural damage"],
        "recommendations": ["Dispatch assessment teams"],
        "confidence": 0.7,
    },
    "grounding_score": 0.82,
    "numbers_grounded": True,
    "domain_constraints_ok": True,
    "sources": [{"id": "a", "summary": "earthquake hazard in Testville", "metadata": {}}],
}


def test_report_lists_top_incidents_with_clickable_source_links():
    _, md, _ = build_report("situation", None, [item("a", "Testville")], GOOD_BRIEF, "sara", NOW)
    assert "## Top 1 incidents by priority" in md
    assert "[Open source](https://example.org/e)" in md
    assert "Testville" in md


def test_dismissed_incidents_are_excluded_from_report():
    ranked = [item("a", "Keepville"), item("b", "Dismissedtown", status="dismissed")]
    _, md, _ = build_report("situation", None, ranked, None, "sara", NOW)
    assert "Keepville" in md
    assert "Dismissedtown" not in md
    assert "Active incidents: 1" in md


def test_regional_scope_filters_incidents_and_names_title():
    ranked = [item("a", "Quake near Sumatra"), item("b", "Flood in Peru")]
    title, md, _ = build_report("regional", "Sumatra", ranked, None, "sara", NOW)
    assert title == "Regional Focus Report: Sumatra"
    assert "Sumatra" in md and "Peru" not in md


def test_empty_scope_result_says_so_and_skips_ai():
    title, md, ai = build_report("regional", "Atlantis", [item("a", "Testville")], GOOD_BRIEF, "sara", NOW)
    assert "No active incidents were found" in md
    assert ai is False
    assert "AI assessment" not in md


def test_ai_section_included_with_plain_language_reliability_checks():
    _, md, ai = build_report("executive", None, [item("a", "Testville")], GOOD_BRIEF, "sara", NOW)
    assert ai is True
    assert "A major quake struck near Testville." in md
    assert "Numbers and dates verified" in md
    assert "82%" in md


def test_report_is_honest_when_ai_is_unavailable():
    _, md, ai = build_report("situation", None, [item("a", "Testville")], None, "sara", NOW)
    assert ai is False
    assert "AI assessment is unavailable" in md
    assert "Testville" in md  # data sections are unaffected


def test_report_is_honest_when_ai_output_failed_validation():
    bad = {**GOOD_BRIEF, "schema_valid": False, "structured_brief": None}
    _, md, ai = build_report("situation", None, [item("a", "Testville")], bad, "sara", NOW)
    assert ai is False
    assert "unavailable" in md


def test_markdown_punctuation_in_feed_text_is_stripped_so_formatting_cannot_break():
    ranked = [item("a", "Protest *in* [Capital](evil) _city_")]
    _, md, _ = build_report("situation", None, ranked, None, "sara", NOW)
    assert "[Capital](evil)" not in md


def test_urls_with_parentheses_do_not_break_markdown_links():
    ranked = [item("a", "X", url="https://example.org/a_(b)")]
    _, md, _ = build_report("situation", None, ranked, None, "sara", NOW)
    assert "https://example.org/a_%28b%29" in md


def test_confirmed_and_overridden_flags_are_shown():
    ranked = [item("a", "X", validated=True, overridden=True)]
    _, md, _ = build_report("situation", None, ranked, None, "sara", NOW)
    assert "analyst-confirmed" in md and "severity set by analyst" in md


def test_describe_guardrails_flags_failures_in_plain_words():
    lines = describe_guardrails({"grounding_score": 0.4, "numbers_grounded": False, "domain_constraints_ok": False})
    text = " ".join(lines)
    assert "40%" in text
    assert "NOT verified" in text and "NOT consistent" in text


def test_brief_query_uses_scope_only_for_regional():
    assert "Sumatra" in brief_query_for("regional", "Sumatra")
    assert "Sumatra" not in brief_query_for("situation", "Sumatra")

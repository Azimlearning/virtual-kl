import json
import logging
import re

from pydantic import ValidationError

from ..config import settings
from ..knowledge.query import hybrid_search
from .guardrails import domain_constraints_ok, grounding_score, numeric_grounding_ok
from .llm_client import generate_completion
from .prompts import DEFAULT_ROLE, build_prompt
from .schemas import StructuredBrief

logger = logging.getLogger(__name__)

_CODE_FENCE_PATTERN = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# A brief is only considered "alert-worthy" - i.e. the kind that should
# eventually trigger a notification once the dashboard layer builds that
# delivery mechanism - if it passes every guardrail AND at least one
# retrieved source is actually Orange/Red. This is the "before any brief
# ... triggers an alert" decision logic the architecture names; the
# notification delivery itself (email/Telegram) is presentation-layer
# work, deliberately out of scope here.
_ALERT_WORTHY_LEVELS = {"orange", "red"}


def _strip_code_fences(text: str) -> str:
    """Models sometimes wrap JSON output in markdown code fences even when
    told not to. Strip them before attempting to parse rather than failing
    schema validation on a purely cosmetic formatting choice.
    """
    return _CODE_FENCE_PATTERN.sub("", text).strip()


def _is_alert_worthy(schema_valid: bool, grounding: float, numbers_ok: bool, domain_ok: bool, retrieved: list[dict]) -> bool:
    if not (schema_valid and numbers_ok and domain_ok):
        return False
    if grounding < 0.2:
        return False
    return any(
        str(h.get("metadata", {}).get("alert_level", "")).lower() in _ALERT_WORTHY_LEVELS for h in retrieved
    )


async def generate_brief(query: str, n_results: int | None = None, role: str = DEFAULT_ROLE) -> dict:
    """The RAG pipeline: Retrieve (hybrid Chroma + Neo4j search) -> Augment
    (build_prompt stuffs those results into the prompt, framed for `role`)
    -> Generate (Claude writes a structured JSON briefing). Three
    independent guardrails then run on the output: grounding_score
    (word-overlap), numeric_grounding_ok (stricter, number-specific
    fact-check), and domain_constraints_ok (alert-level claims must match
    retrieved data). A pass on all three, plus at least one Orange/Red
    source, marks the brief alert_triggered=True and logs it for audit -
    the decision layer for alerting, ahead of the actual notification
    delivery mechanism (dashboard work).
    """
    n_results = n_results or settings.intelligence_top_k

    retrieved = await hybrid_search(query, n_results=n_results)
    prompt = build_prompt(query, retrieved, role=role)
    raw_output = await generate_completion(prompt)

    structured: StructuredBrief | None = None
    schema_valid = True
    try:
        parsed = json.loads(_strip_code_fences(raw_output))
        structured = StructuredBrief.model_validate(parsed)
    except (json.JSONDecodeError, ValidationError):
        schema_valid = False
        logger.warning("[Intelligence] LLM output failed schema validation, keeping raw text only")

    # Score against whichever text we actually have - the structured
    # content fields if parsing succeeded, otherwise the raw output.
    # Deliberately excludes `confidence` from all checks below: it's the
    # model's own self-rated score, not a factual claim traceable to
    # source data, so checking it against retrieved numbers/levels would
    # incorrectly flag legitimate metadata as "hallucinated".
    if structured:
        scoring_text = " ".join([structured.executive_summary, *structured.key_impacts, *structured.recommendations])
    else:
        scoring_text = raw_output

    grounding = grounding_score(scoring_text, retrieved)
    numbers_ok = numeric_grounding_ok(scoring_text, retrieved)
    domain_ok = domain_constraints_ok(scoring_text, retrieved)
    alert_triggered = _is_alert_worthy(schema_valid, grounding, numbers_ok, domain_ok, retrieved)

    if alert_triggered:
        logger.info("[Intelligence] ALERT-WORTHY brief generated for query=%r role=%r", query, role)

    return {
        "query": query,
        "role": role,
        "structured_brief": structured.model_dump() if structured else None,
        "raw_output": raw_output,
        "schema_valid": schema_valid,
        "sources": retrieved,
        "grounding_score": grounding,
        "numbers_grounded": numbers_ok,
        "domain_constraints_ok": domain_ok,
        "alert_triggered": alert_triggered,
    }

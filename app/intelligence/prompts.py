from datetime import date, datetime, timezone

SYSTEM_INSTRUCTIONS = (
    "You are a crisis intelligence analyst. Using ONLY the hazard data "
    "provided below, respond with a single JSON object and nothing else "
    "(no markdown, no commentary outside the JSON) matching exactly this "
    "schema:\n"
    '{"executive_summary": "<string>", "key_impacts": ["<string>", ...], '
    '"recommendations": ["<string>", ...], "confidence": <number 0 to 1>}\n\n'
    "Do not invent locations, numbers, dates, or events that are not listed. "
    "Only mention a date if it appears in the records, written exactly as "
    "there. If "
    "the provided data doesn't answer the question, say so explicitly "
    "inside executive_summary and return empty lists for the others."
)

# "Role-based instructions" (named in the architecture's Prompt
# Orchestrator description): the same retrieved facts, reframed for who's
# reading. Deliberately kept to tone/framing, not different content rules -
# the guardrails apply identically regardless of role.
ROLE_INSTRUCTIONS = {
    "operator": (
        "Write for a field operator who needs immediate, actionable guidance "
        "under time pressure. Prioritise clarity and brevity over nuance."
    ),
    "executive": (
        "Write for a senior decision-maker who needs strategic context and "
        "resource-allocation implications, not tactical detail."
    ),
    "analyst": (
        "Write for a crisis analyst who needs full traceability and nuance, "
        "including uncertainty and any data gaps."
    ),
}
DEFAULT_ROLE = "analyst"


def build_prompt(
    query: str, retrieved_hazards: list[dict], role: str = DEFAULT_ROLE, today: "date | None" = None
) -> str:
    """This string is the entire interface between your real data and the
    LLM's output. If a fact isn't in here, the model has no way to know
    it - which is exactly the point: it constrains the model to only
    talk about hazards that were actually retrieved.
    """
    if not retrieved_hazards:
        context = "No matching hazard data was found in the database."
    else:
        context = "\n".join(f"- {h['summary']}" for h in retrieved_hazards)

    role_instruction = ROLE_INSTRUCTIONS.get(role, ROLE_INSTRUCTIONS[DEFAULT_ROLE])

    today = today or datetime.now(timezone.utc).date()
    return (
        f"{SYSTEM_INSTRUCTIONS}\n\n"
        f"Today's date (UTC): {today.day} {today.strftime('%B %Y')}. Use it only to judge "
        f"how recent a record is; do not state it in the answer.\n\n"
        f"Audience: {role_instruction}\n\n"
        f"Question: {query}\n\n"
        f"Retrieved hazard data:\n{context}\n\n"
        f"JSON response:"
    )

"""Deliberately simple guardrail, worth being upfront about in your
dissertation: this checks whether the words in the generated briefing
actually appear somewhere in the retrieved hazard data. It's a heuristic,
not a rigorous fact-checker.

What it CAN catch: the model inventing a country, hazard type, or event
that was never in the retrieved context (a common, fairly blatant form
of hallucination).

What it CANNOT catch: a subtly wrong number, or a false claim built
entirely out of words that happen to also appear in the real data. A
low grounding_score is a signal worth a human double-checking, not a
guarantee of either correctness or fabrication.
"""

import re

_WORD_PATTERN = re.compile(r"[A-Za-z]{4,}")


def extract_known_terms(retrieved_hazards: list[dict]) -> set[str]:
    terms: set[str] = set()
    for hazard in retrieved_hazards:
        metadata = hazard.get("metadata", {}) or {}
        for value in (metadata.get("hazard_type"), metadata.get("source")):
            if value:
                terms.add(str(value).lower())
        terms.update(w.lower() for w in _WORD_PATTERN.findall(hazard.get("summary", "")))
    return terms


def grounding_score(generated_text: str, retrieved_hazards: list[dict]) -> float:
    """Fraction (0.0-1.0) of significant words in the generated text that
    also appear in the retrieved context. Higher = more grounded.
    """
    known_terms = extract_known_terms(retrieved_hazards)
    generated_words = set(_WORD_PATTERN.findall(generated_text.lower()))

    if not known_terms or not generated_words:
        return 0.0

    overlap = generated_words & known_terms
    return round(len(overlap) / len(generated_words), 2)


_NUMBER_PATTERN = re.compile(r"\d+(?:\.\d+)?")

# Full month names only. "may" (the verb) and "march" (the verb) are left out
# because they appear in ordinary sentences and would cause false alarms.
_MONTHS = (
    "january", "february", "april", "june", "july", "august",
    "september", "october", "november", "december",
)


def numeric_grounding_ok(generated_text: str, retrieved_hazards: list[dict]) -> bool:
    """A stricter, complementary check to grounding_score: a model can
    reuse plausible-sounding vocabulary freely (which word-overlap alone
    would score as "grounded"), but specific numbers are either the real
    severity/magnitude values from the source data or they're fabricated.
    This flags any number in the output that doesn't appear anywhere in
    the retrieved source text.

    It also flags a month name the sources never mention (an answer saying
    "10 October" about a record from July). Limit: it cannot tell a wrong
    day number from a right one if that number appears elsewhere.
    """
    source_text = " ".join(h.get("summary", "") for h in retrieved_hazards)

    generated_lower = generated_text.lower()
    source_lower = source_text.lower()
    for month in _MONTHS:
        if re.search(rf"\b{month}\b", generated_lower) and not re.search(rf"\b{month}\b", source_lower):
            return False

    generated_numbers = set(_NUMBER_PATTERN.findall(generated_text))
    if not generated_numbers:
        return True  # nothing numeric was claimed, so nothing to contradict

    source_numbers = set(_NUMBER_PATTERN.findall(source_text))

    return generated_numbers.issubset(source_numbers)


_ALERT_LEVEL_WORDS = {"green", "orange", "red"}


def domain_constraints_ok(generated_text: str, retrieved_hazards: list[dict]) -> bool:
    """A domain-specific rule check, distinct from the generic word/number
    overlap checks above: if the brief claims an alert level (e.g. "Red
    alert"), that level must actually appear among the retrieved hazards'
    real alert levels. Catches a specific, checkable failure mode - a
    brief overstating severity (claiming Red when nothing retrieved was
    ever scored above Green) - that pure word-overlap wouldn't flag, since
    "red" and "alert" could easily appear as plausible vocabulary either way.
    """
    mentioned_levels = {
        w.lower() for w in re.findall(r"[A-Za-z]+", generated_text) if w.lower() in _ALERT_LEVEL_WORDS
    }
    if not mentioned_levels:
        return True

    actual_levels = {
        str(h.get("metadata", {}).get("alert_level", "")).lower() for h in retrieved_hazards
    }
    return mentioned_levels.issubset(actual_levels)

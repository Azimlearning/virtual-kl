"""Alert prioritization (named explicitly in the architecture: "Categorisation
and ranking of incoming alerts based on severity and impact").

The hard part: severity_score means completely different things per source
(USGS: Richter magnitude ~0-9; GDACS: a 1-3 alert score; Open-Meteo: a
Z-score where >=5 is extreme; GDELT: a fixed constant; ACLED: a raw
fatality count). These can't be compared directly as if they were the same
unit - a GDACS score of 2 is not "more severe" than an earthquake magnitude
of 2 in any meaningful sense.

Design: alert_level (already a domain-appropriate judgment made by each
worker, using thresholds suited to that specific hazard type) sets the base
score for its tier. severity_score is then used only as a *within-tier*
tiebreaker - normalized against that source's own typical range - never to
compare across sources directly. This keeps the heterogeneous-units problem
from corrupting cross-source ranking, at the cost of being a documented
heuristic rather than a scientifically derived risk score.

The 80/60/35 thresholds and Critical/High/Moderate/Low labels match a
severity taxonomy from a separate UI prototype (built with v0, not part of
the core system) - reused here since it's a clean, presentable taxonomy to
adopt, not because it has special scientific standing.
"""

from .models import HazardRecord

ALERT_LEVEL_BASE_SCORE = {"Red": 75.0, "Orange": 50.0, "Green": 20.0}

# Rough practical max for each source's severity_score, used only to
# normalize the within-tier adjustment to a 0-1 range - not a claim that
# these units are equivalent across sources.
SEVERITY_SCALE_BY_SOURCE = {
    "usgs": 9.0,  # Richter magnitude, practical max ~9
    "gdacs": 3.0,  # GDACS alert score, 1-3
    "open-meteo": 5.0,  # Z-score; >=5 is already extreme
    "gdelt": 10.0,  # fixed base severity of 5.0, headroom to 10
    "gnews": 10.0,  # keyword-derived: 1.0 (Green) to 4.0-5.0 (Orange)
    "acled": 20.0,  # fatality count; 20+ is already very severe
}

PRIORITY_THRESHOLDS = [(80.0, "Critical"), (60.0, "High"), (35.0, "Moderate")]
DEFAULT_PRIORITY_LABEL = "Low"


def compute_priority_score(severity_score: float, alert_level: str, source: str) -> float:
    base = ALERT_LEVEL_BASE_SCORE.get(alert_level, ALERT_LEVEL_BASE_SCORE["Green"])
    scale = SEVERITY_SCALE_BY_SOURCE.get(source, 10.0)
    normalized = min(max(severity_score, 0.0) / scale, 1.0) if scale else 0.0
    adjustment = normalized * 25.0  # up to +25 points within the alert-level tier
    return round(min(base + adjustment, 100.0), 1)


def priority_label(score: float) -> str:
    for threshold, label in PRIORITY_THRESHOLDS:
        if score >= threshold:
            return label
    return DEFAULT_PRIORITY_LABEL


def rank_hazards(hazards: list[HazardRecord], limit: int = 5, reviews: dict | None = None) -> list[dict]:
    """Rank hazards by priority_score, highest first.

    `reviews` (optional) maps hazard id -> an IncidentReview. It is how the
    human-in-the-loop decisions reach the ranking: if an analyst set a
    severity_override, that value replaces the computed score (and the
    Critical/High/Moderate/Low label is re-derived from it, so the label
    logic stays in this one Python file rather than being copied into the
    frontend). Review status/validated flags are passed through so the UI
    can hide dismissed incidents and show a "validated" tick.
    """
    reviews = reviews or {}
    scored = []
    for h in hazards:
        review = reviews.get(h.id)
        overridden = review is not None and review.severity_override is not None
        score = (
            round(float(review.severity_override), 1)
            if overridden
            else compute_priority_score(h.severity_score, h.alert_level, h.source)
        )
        scored.append(
            {
                "id": h.id,
                "hazard_type": h.hazard_type,
                "location_name": h.location_name,
                "alert_level": h.alert_level,
                "source": h.source,
                "timestamp": h.timestamp,
                "priority_score": score,
                "priority_label": priority_label(score),
                "severity_overridden": overridden,
                "status": review.status if review else "active",
                "validated": review.validated if review else False,
                "reviewed_by": review.reviewed_by if review else None,
            }
        )
    scored.sort(key=lambda item: item["priority_score"], reverse=True)
    return scored[:limit]

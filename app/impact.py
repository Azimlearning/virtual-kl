"""Impact estimation (Layer 2 requirement).

No source provides real population/infrastructure exposure data, so a
full quantitative impact model (people affected, economic cost) isn't
honestly achievable with what's available. This is a deliberately simple,
transparent proxy - alert_level already reflects severity, so it doubles
as a coarse impact tier. Documented as a known simplification, not
presented as a rigorous impact model.
"""

IMPACT_BY_ALERT_LEVEL = {
    "Red": "Severe",
    "Orange": "Moderate",
    "Green": "Low",
}


def estimate_impact(alert_level: str) -> str:
    return IMPACT_BY_ALERT_LEVEL.get(alert_level, "Low")

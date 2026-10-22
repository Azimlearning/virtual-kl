from app.impact import estimate_impact


def test_estimate_impact_maps_alert_levels():
    assert estimate_impact("Red") == "Severe"
    assert estimate_impact("Orange") == "Moderate"
    assert estimate_impact("Green") == "Low"


def test_estimate_impact_defaults_to_low_for_unknown_level():
    assert estimate_impact("Unknown") == "Low"

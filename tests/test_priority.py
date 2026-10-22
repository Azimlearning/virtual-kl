from datetime import datetime, timezone

from app.models import HazardRecord
from app.priority import compute_priority_score, priority_label, rank_hazards


def make_record(id_, severity_score, alert_level, source, hazard_type="earthquake"):
    return HazardRecord(
        id=id_,
        hazard_type=hazard_type,
        location_name="Test",
        latitude=0.0,
        longitude=0.0,
        severity_score=severity_score,
        alert_level=alert_level,
        timestamp=datetime(2026, 9, 1, tzinfo=timezone.utc),
        alert_triggered=alert_level in ("Orange", "Red"),
        source=source,
    )


def test_priority_label_thresholds_match_the_adopted_taxonomy():
    assert priority_label(85) == "Critical"
    assert priority_label(80) == "Critical"
    assert priority_label(65) == "High"
    assert priority_label(40) == "Moderate"
    assert priority_label(10) == "Low"


def test_red_alert_always_outranks_green_alert_regardless_of_raw_severity_number():
    """The core design point: alert_level (domain-tuned per source) sets
    the base tier, so a Red from a low-scale source still outranks a Green
    from a high-scale source - raw severity_score numbers are never
    compared directly across sources.
    """
    red_gdacs = compute_priority_score(severity_score=3.0, alert_level="Red", source="gdacs")
    green_usgs = compute_priority_score(severity_score=9.0, alert_level="Green", source="usgs")
    assert red_gdacs > green_usgs


def test_severity_score_breaks_ties_within_the_same_alert_level():
    low_end = compute_priority_score(severity_score=2.0, alert_level="Orange", source="usgs")
    high_end = compute_priority_score(severity_score=6.5, alert_level="Orange", source="usgs")
    assert high_end > low_end


def test_rank_hazards_sorts_by_priority_and_respects_limit():
    hazards = [
        make_record("a", severity_score=2.5, alert_level="Green", source="usgs"),
        make_record("b", severity_score=6.0, alert_level="Red", source="usgs"),
        make_record("c", severity_score=4.0, alert_level="Orange", source="gdacs"),
    ]
    ranked = rank_hazards(hazards, limit=2)
    assert len(ranked) == 2
    assert ranked[0]["id"] == "b"  # Red should rank first
    assert ranked[0]["priority_label"] == "Critical"

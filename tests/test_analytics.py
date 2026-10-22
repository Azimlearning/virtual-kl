from datetime import datetime, timezone

from app.analytics import extract_region, top_regions, trends_by_day
from app.models import HazardRecord


def make_record(hazard_type="earthquake", location_name="Test", timestamp=None, id_="h1"):
    return HazardRecord(
        id=id_,
        hazard_type=hazard_type,
        location_name=location_name,
        latitude=0.0,
        longitude=0.0,
        severity_score=1.0,
        alert_level="Green",
        timestamp=timestamp or datetime(2026, 9, 1, tzinfo=timezone.utc),
        alert_triggered=False,
        source="usgs",
    )


def test_extract_region_usgs_style():
    assert extract_region("93 km SE of Kirakira, Solomon Islands") == "Solomon Islands"


def test_extract_region_gdacs_style():
    assert extract_region("Orange flood alert in India") == "India"


def test_extract_region_gdelt_style():
    assert extract_region("Protests erupt in capital (Malaysia)") == "Malaysia"


def test_extract_region_falls_back_to_full_string_when_no_pattern_matches():
    assert extract_region("Unparseable Location String") == "Unparseable Location String"


def test_trends_by_day_groups_correctly():
    records = [
        make_record("earthquake", id_="a", timestamp=datetime(2026, 9, 1, 10, tzinfo=timezone.utc)),
        make_record("earthquake", id_="b", timestamp=datetime(2026, 9, 1, 14, tzinfo=timezone.utc)),
        make_record("flood", id_="c", timestamp=datetime(2026, 9, 2, 9, tzinfo=timezone.utc)),
    ]
    result = trends_by_day(records)
    assert result == [
        {"date": "2026-09-01", "earthquake": 2},
        {"date": "2026-09-02", "flood": 1},
    ]


def test_top_regions_counts_and_ranks():
    records = [
        make_record(location_name="Orange flood alert in India", id_="a"),
        make_record(location_name="Orange flood alert in India", id_="b"),
        make_record(location_name="Green flood alert in Ghana", id_="c"),
    ]
    result = top_regions(records, limit=5)
    assert result[0] == {"region": "India", "count": 2}
    assert result[1] == {"region": "Ghana", "count": 1}

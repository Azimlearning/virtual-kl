from datetime import datetime, timezone

from app.knowledge.sync import _hazard_summary
from app.models import HazardRecord


def test_hazard_summary_includes_key_fields():
    record = HazardRecord(
        id="test1",
        hazard_type="earthquake",
        location_name="10km N of Testville",
        latitude=1.0,
        longitude=2.0,
        severity_score=6.8,
        alert_level="Red",
        timestamp=datetime(2026, 8, 27, tzinfo=timezone.utc),
        alert_triggered=True,
        source="usgs",
    )

    summary = _hazard_summary(record)

    # This is the exact text Chroma embeds and searches over, so every
    # field that should be findable via semantic search needs to actually
    # appear in the string.
    assert "earthquake" in summary
    assert "10km N of Testville" in summary
    assert "Red" in summary
    assert "6.8" in summary
    assert "usgs" in summary

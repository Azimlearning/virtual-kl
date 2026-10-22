import httpx
import pytest
import respx

from app import database as db_module
from app.repository import list_hazards
from app.workers import usgs

SAMPLE_FEED = {
    "features": [
        {
            "id": "us1234",
            "properties": {"mag": 6.8, "place": "10km N of Testville", "time": 1750000000000},
            "geometry": {"coordinates": [101.5, 3.1, 10.0]},
        },
        {
            "id": "us5678",
            "properties": {"mag": 4.2, "place": "Offshore Testland", "time": 1750000100000},
            "geometry": {"coordinates": [102.0, 4.0, 5.0]},
        },
        {
            "id": "us9012",
            "properties": {"mag": 6.0, "place": "Near Testport", "time": 1750000200000},
            "geometry": {"coordinates": [103.0, 5.0, 8.0]},
        },
    ]
}


@pytest.mark.asyncio
@respx.mock
async def test_fetch_global_earthquakes_classifies_alert_levels(session_factory, monkeypatch):
    # Point the worker's DB writes at the in-memory test DB instead of Postgres.
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)

    respx.get(url__regex=r".*earthquake\.usgs\.gov.*").mock(
        return_value=httpx.Response(200, json=SAMPLE_FEED)
    )

    count = await usgs.fetch_global_earthquakes()
    assert count == 3

    async with session_factory() as session:
        records = await list_hazards(session)

    by_id = {r.id: r for r in records}
    assert by_id["us1234"].alert_level == "Red"       # mag 6.8 >= 6.5
    assert by_id["us5678"].alert_level == "Green"      # mag 4.2 < 5.5
    assert by_id["us9012"].alert_level == "Orange"     # 5.5 <= mag 6.0 < 6.5
    assert all(r.source == "usgs" for r in records)


@pytest.mark.asyncio
@respx.mock
async def test_fetch_global_earthquakes_handles_http_failure_gracefully(session_factory, monkeypatch):
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)

    respx.get(url__regex=r".*earthquake\.usgs\.gov.*").mock(
        return_value=httpx.Response(500)
    )

    count = await usgs.fetch_global_earthquakes()
    assert count == 0  # should not raise, just report zero synced

    async with session_factory() as session:
        records = await list_hazards(session)
    assert records == []

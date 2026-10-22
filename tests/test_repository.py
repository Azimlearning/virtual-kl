from datetime import datetime, timezone

import pytest

from app.repository import count_by_type, list_hazards, upsert_many
from app.schemas import HazardEvent


def make_event(id_="eq1", hazard_type="earthquake", severity=6.0, source="usgs"):
    return HazardEvent(
        id=id_,
        hazard_type=hazard_type,
        location_name="Test Location",
        latitude=1.0,
        longitude=2.0,
        severity_score=severity,
        alert_level="Orange",
        timestamp=datetime.now(timezone.utc),
        alert_triggered=True,
        source=source,
    )


@pytest.mark.asyncio
async def test_upsert_inserts_new_record(session_factory):
    async with session_factory() as session:
        count = await upsert_many(session, [make_event()])
        assert count == 1

    async with session_factory() as session:
        records = await list_hazards(session)
        assert len(records) == 1
        assert records[0].id == "eq1"


@pytest.mark.asyncio
async def test_upsert_updates_existing_record_in_place(session_factory):
    """Repeated polls for the same id should update, not duplicate, the row
    (this is the behavior that was missing for GDELT ids in the prototype).
    """
    async with session_factory() as session:
        await upsert_many(session, [make_event(severity=5.0)])

    async with session_factory() as session:
        await upsert_many(session, [make_event(severity=7.2)])

    async with session_factory() as session:
        records = await list_hazards(session)
        assert len(records) == 1
        assert records[0].severity_score == 7.2


@pytest.mark.asyncio
async def test_count_by_type_groups_correctly(session_factory):
    async with session_factory() as session:
        await upsert_many(
            session,
            [
                make_event(id_="eq1", hazard_type="earthquake"),
                make_event(id_="eq2", hazard_type="earthquake"),
                make_event(id_="fl1", hazard_type="flood", source="gdacs"),
            ],
        )

    async with session_factory() as session:
        counts = await count_by_type(session)
        assert counts == {"earthquake": 2, "flood": 1}


@pytest.mark.asyncio
async def test_list_hazards_filters_by_type_and_alert_level(session_factory):
    async with session_factory() as session:
        await upsert_many(
            session,
            [
                make_event(id_="a", hazard_type="earthquake"),
                make_event(id_="b", hazard_type="flood", source="gdacs"),
            ],
        )

    async with session_factory() as session:
        earthquakes = await list_hazards(session, hazard_type="earthquake")
        assert [r.id for r in earthquakes] == ["a"]

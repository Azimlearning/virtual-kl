import pytest

from app.repository import (
    create_incident_note,
    list_all_incident_notes,
    list_incident_notes,
    upsert_many,
)
from app.schemas import HazardEvent, IncidentNoteCreate
from datetime import datetime, timezone


def make_hazard(id_="h1"):
    return HazardEvent(
        id=id_,
        hazard_type="earthquake",
        location_name="Test Location",
        latitude=1.0,
        longitude=2.0,
        severity_score=6.0,
        alert_level="Orange",
        timestamp=datetime.now(timezone.utc),
        alert_triggered=True,
        source="usgs",
    )


@pytest.mark.asyncio
async def test_create_and_list_incident_note(session_factory):
    async with session_factory() as session:
        await upsert_many(session, [make_hazard()])

    note = IncidentNoteCreate(
        note_type="response_log",
        content="Evacuation teams dispatched",
        affected_infrastructure="Main Bridge",
        responding_organisation="Local Red Cross",
        created_by="operator_1",
    )

    async with session_factory() as session:
        created = await create_incident_note(session, "h1", note)
        assert created.id is not None
        assert created.hazard_id == "h1"

    async with session_factory() as session:
        notes = await list_incident_notes(session, "h1")
        assert len(notes) == 1
        assert notes[0].content == "Evacuation teams dispatched"
        assert notes[0].affected_infrastructure == "Main Bridge"
        assert notes[0].responding_organisation == "Local Red Cross"


@pytest.mark.asyncio
async def test_list_all_incident_notes_used_by_knowledge_sync(session_factory):
    async with session_factory() as session:
        await upsert_many(session, [make_hazard("h1"), make_hazard("h2")])

    async with session_factory() as session:
        await create_incident_note(
            session, "h1", IncidentNoteCreate(note_type="lesson_learned", content="Note A")
        )
        await create_incident_note(
            session, "h2", IncidentNoteCreate(note_type="impact_record", content="Note B")
        )

    async with session_factory() as session:
        all_notes = await list_all_incident_notes(session)
        assert len(all_notes) == 2

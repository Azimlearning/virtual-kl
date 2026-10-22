from datetime import datetime, timezone

import pytest

from app.models import HazardRecord
from app.priority import rank_hazards
from app.repository import (
    apply_review_decision,
    apply_severity_override,
    list_audit_log,
    list_reviews,
    upsert_many,
)
from app.schemas import HazardEvent


def make_hazard(id_="h1", alert_level="Orange", severity_score=6.0):
    return HazardEvent(
        id=id_,
        hazard_type="earthquake",
        location_name="Test Location",
        latitude=1.0,
        longitude=2.0,
        severity_score=severity_score,
        alert_level=alert_level,
        timestamp=datetime.now(timezone.utc),
        alert_triggered=True,
        source="usgs",
    )


# --- repository layer -------------------------------------------------------


@pytest.mark.asyncio
async def test_confirm_marks_validated_and_writes_audit_entry(session_factory):
    async with session_factory() as session:
        await upsert_many(session, [make_hazard()])

    async with session_factory() as session:
        review = await apply_review_decision(session, "h1", "confirm", "analyst_1")
        assert review.validated is True
        assert review.status == "active"
        assert review.reviewed_by == "analyst_1"

    async with session_factory() as session:
        log = await list_audit_log(session)
        assert len(log) == 1
        assert log[0].action == "incident_confirmed"
        assert log[0].actor_name == "analyst_1"
        assert log[0].entity_id == "h1"


@pytest.mark.asyncio
async def test_dismiss_then_confirm_reopens_the_incident(session_factory):
    """A mistaken dismissal must be reversible, and both steps must be
    in the audit trail."""
    async with session_factory() as session:
        await upsert_many(session, [make_hazard()])

    async with session_factory() as session:
        dismissed = await apply_review_decision(session, "h1", "dismiss", "a")
        assert dismissed.status == "dismissed"
        assert dismissed.validated is False

    async with session_factory() as session:
        reopened = await apply_review_decision(session, "h1", "confirm", "a")
        assert reopened.status == "active"
        assert reopened.validated is True

    async with session_factory() as session:
        actions = [e.action for e in await list_audit_log(session)]
        assert sorted(actions) == ["incident_confirmed", "incident_dismissed"]


@pytest.mark.asyncio
async def test_severity_override_records_previous_value_in_audit_details(session_factory):
    async with session_factory() as session:
        await upsert_many(session, [make_hazard()])

    async with session_factory() as session:
        await apply_severity_override(session, "h1", 90.0, "a")
    async with session_factory() as session:
        await apply_severity_override(session, "h1", 40.0, "a")

    async with session_factory() as session:
        reviews = await list_reviews(session)
        assert reviews["h1"].severity_override == 40.0
        log = await list_audit_log(session)
        # newest first: the second override, which replaced the first (90).
        assert log[0].action == "severity_override"
        assert log[0].details == {"severity": 40.0, "previous": 90.0}


@pytest.mark.asyncio
async def test_unknown_hazard_returns_none_and_writes_nothing(session_factory):
    async with session_factory() as session:
        assert await apply_review_decision(session, "nope", "confirm", "a") is None
        assert await apply_severity_override(session, "nope", 50.0, "a") is None

    async with session_factory() as session:
        assert await list_audit_log(session) == []
        assert await list_reviews(session) == {}


@pytest.mark.asyncio
async def test_review_survives_re_ingestion_of_the_same_hazard(session_factory):
    """The reason reviews live in their own table: workers re-upsert every
    hazard each poll, and that must not erase a human decision."""
    async with session_factory() as session:
        await upsert_many(session, [make_hazard()])
    async with session_factory() as session:
        await apply_review_decision(session, "h1", "dismiss", "a")

    async with session_factory() as session:
        await upsert_many(session, [make_hazard(severity_score=7.5)])  # same id, new data

    async with session_factory() as session:
        reviews = await list_reviews(session)
        assert reviews["h1"].status == "dismissed"


# --- priority ranking -------------------------------------------------------


def _record(id_, severity_score, alert_level):
    return HazardRecord(
        id=id_,
        hazard_type="earthquake",
        location_name="Test",
        latitude=0.0,
        longitude=0.0,
        severity_score=severity_score,
        alert_level=alert_level,
        timestamp=datetime(2026, 9, 1, tzinfo=timezone.utc),
        alert_triggered=False,
        source="usgs",
    )


class _FakeReview:
    def __init__(self, status="active", validated=False, severity_override=None, reviewed_by="a"):
        self.status = status
        self.validated = validated
        self.severity_override = severity_override
        self.reviewed_by = reviewed_by


def test_rank_hazards_without_reviews_still_works_and_defaults_to_active():
    ranked = rank_hazards([_record("a", 5.0, "Orange")])
    assert ranked[0]["status"] == "active"
    assert ranked[0]["validated"] is False
    assert ranked[0]["severity_overridden"] is False


def test_override_replaces_score_and_rederives_label():
    hazards = [_record("low", 2.5, "Green"), _record("other", 6.0, "Orange")]
    ranked = rank_hazards(hazards, reviews={"low": _FakeReview(severity_override=95.0)})
    assert ranked[0]["id"] == "low"  # a Green, lifted above an Orange by the analyst
    assert ranked[0]["priority_score"] == 95.0
    assert ranked[0]["priority_label"] == "Critical"
    assert ranked[0]["severity_overridden"] is True


def test_review_flags_pass_through_to_ranked_output():
    ranked = rank_hazards(
        [_record("a", 5.0, "Red")],
        reviews={"a": _FakeReview(status="dismissed", validated=False, reviewed_by="sara")},
    )
    assert ranked[0]["status"] == "dismissed"
    assert ranked[0]["reviewed_by"] == "sara"


# --- HTTP endpoints ---------------------------------------------------------


@pytest.mark.asyncio
async def test_review_endpoint_confirm_then_prioritized_shows_validated(client, session_factory):
    async with session_factory() as session:
        await upsert_many(session, [make_hazard()])

    resp = await client.post("/api/incidents/h1/review", json={"decision": "confirm", "actor": "sara"})
    assert resp.status_code == 200
    assert resp.json()["validated"] is True

    ranked = (await client.get("/api/hazards/prioritized")).json()
    assert ranked[0]["validated"] is True
    assert ranked[0]["reviewed_by"] == "sara"


@pytest.mark.asyncio
async def test_severity_endpoint_overrides_and_audit_log_endpoint_lists_it(client, session_factory):
    async with session_factory() as session:
        await upsert_many(session, [make_hazard()])

    resp = await client.post("/api/incidents/h1/severity", json={"severity": 88, "actor": "sara"})
    assert resp.status_code == 200

    ranked = (await client.get("/api/hazards/prioritized")).json()
    assert ranked[0]["priority_score"] == 88.0
    assert ranked[0]["priority_label"] == "Critical"

    log = (await client.get("/api/audit-log")).json()
    assert log[0]["action"] == "severity_override"
    assert log[0]["actor_name"] == "sara"


@pytest.mark.asyncio
async def test_endpoints_return_404_for_unknown_hazard(client):
    r1 = await client.post("/api/incidents/ghost/review", json={"decision": "confirm"})
    r2 = await client.post("/api/incidents/ghost/severity", json={"severity": 50})
    assert r1.status_code == 404
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_endpoints_reject_invalid_input_with_422(client, session_factory):
    async with session_factory() as session:
        await upsert_many(session, [make_hazard()])

    bad_decision = await client.post("/api/incidents/h1/review", json={"decision": "maybe"})
    out_of_range = await client.post("/api/incidents/h1/severity", json={"severity": 150})
    assert bad_decision.status_code == 422
    assert out_of_range.status_code == 422

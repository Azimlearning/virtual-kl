"""Tests for: GNews worker, source links, date wording, guardrail month check,
date windows, notes limits, status endpoint."""

from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
import respx
from pydantic import ValidationError

from app import database as db_module
from app.config import settings
from app.intelligence.guardrails import numeric_grounding_ok
from app.intelligence.prompts import build_prompt
from app.knowledge.sync import _hazard_summary
from app.links import resolve_url
from app.models import HazardRecord
from app.repository import (
    create_incident_note,
    list_audit_log,
    list_contexts,
    list_hazards,
    list_links,
    upsert_many,
)
from app.schemas import HazardEvent, IncidentNoteCreate
from app.workers import gnews


def make_event(id_="h1", days_ago=0, **kw):
    base = dict(
        id=id_, hazard_type="earthquake", location_name=f"Place {id_}", latitude=1.0, longitude=2.0,
        severity_score=6.0, alert_level="Orange",
        timestamp=datetime.now(timezone.utc) - timedelta(days=days_ago), alert_triggered=True, source="usgs",
    )
    base.update(kw)
    return HazardEvent(**base)


# --- links: never a fake homepage -------------------------------------------------


def test_resolve_url_stored_then_usgs_rebuild_then_none():
    assert resolve_url("gdacs", "x", "https://real/page") == "https://real/page"
    assert resolve_url("usgs", "us1", None) == "https://earthquake.usgs.gov/earthquakes/eventpage/us1"
    for source in ("gdacs", "gdelt", "acled", "open-meteo", "gnews"):
        assert resolve_url(source, "x", None) is None


# --- summary sentence: spelled-out date + context ------------------------------------


def _record(ts):
    return HazardRecord(id="a", hazard_type="volcano", location_name="Kanlaon, Philippines", latitude=0,
                        longitude=0, severity_score=1.0, alert_level="Green", timestamp=ts,
                        alert_triggered=False, source="gdacs")


def test_summary_spells_out_the_month_and_marks_utc():
    text = _hazard_summary(_record(datetime(2026, 7, 10, 6, 3, tzinfo=timezone.utc)))
    assert "recorded on 10 July 2026 (UTC)" in text
    assert "T06:03" not in text


def test_summary_appends_context_on_one_line_and_truncates():
    text = _hazard_summary(_record(datetime(2026, 7, 10, tzinfo=timezone.utc)), "Line one\n\nline   two " + "x" * 500)
    assert "\n" not in text
    assert "Context: Line one line two" in text
    assert len(text.split("Context: ")[1]) <= 300


def test_prompt_states_today_but_tells_the_model_not_to_repeat_it():
    prompt = build_prompt("q", [], today=date(2026, 10, 21))
    assert "21 October 2026" in prompt and "do not state it" in prompt


# --- guardrail: month names ------------------------------------------------------------


SOURCES = [{"summary": "volcano hazard in Kanlaon, recorded on 10 July 2026 (UTC)."}]


def test_month_not_in_sources_fails_numbers_and_dates_check():
    assert not numeric_grounding_ok("The event on 10 October was reported.", SOURCES)


def test_month_in_sources_passes_and_may_march_are_ignored():
    assert numeric_grounding_ok("Recorded on 10 July 2026.", SOURCES)
    assert numeric_grounding_ok("Officials may march toward the site.", SOURCES)


# --- GNews worker ------------------------------------------------------------------------


def article(title, description="", url="https://news.example/a1", published="2026-10-20T08:15:00Z"):
    return {"title": title, "description": description, "url": url, "publishedAt": published}


def test_build_event_classifies_locates_and_keeps_context():
    event = gnews.build_event(article("Floods hit Nigeria, thousands displaced", "Rivers burst their banks."))
    assert event.hazard_type == "flood" and event.source == "gnews"
    assert event.location_name.endswith("(Nigeria)")
    assert event.alert_level == "Orange" and event.alert_triggered  # 'thousands' + 'displaced'
    assert event.url == "https://news.example/a1" and event.context == "Rivers burst their banks."
    assert event.timestamp == datetime(2026, 10, 20, 8, 15, tzinfo=timezone.utc)
    assert event.id == gnews.build_event(article("different title", "x flood Nigeria")).id  # id = hash of URL


def test_build_event_defaults_to_green_and_never_red():
    event = gnews.build_event(article("Mild earthquake felt in Tokyo"))
    assert event.alert_level == "Green" and not event.alert_triggered
    worst = gnews.build_event(article("Deadly earthquake in Tokyo: killed, injured, destroyed, missing, displaced"))
    assert worst.alert_level == "Orange"


def test_build_event_skips_unusable_articles():
    assert gnews.build_event(article("Celebrity news from Tokyo")) is None  # no hazard keyword
    assert gnews.build_event(article("Earthquake strikes somewhere remote")) is None  # no known place
    assert gnews.build_event({"title": "Flood in Nigeria", "url": ""}) is None  # no link


@pytest.mark.asyncio
async def test_fetch_gnews_skips_without_key(monkeypatch):
    monkeypatch.setattr(settings, "gnews_api_key", "")
    assert await gnews.fetch_gnews_events() == 0


@pytest.mark.asyncio
@respx.mock
async def test_fetch_gnews_stores_events_links_and_context(session_factory, monkeypatch, caplog):
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)
    monkeypatch.setattr(settings, "gnews_api_key", "KEY123")
    feed = {"articles": [
        article("Typhoon nears Manila", "Residents are evacuating."),
        article("Weekend recipes", "Nothing hazardous.", url="https://news.example/a2"),
    ]}
    route = respx.get(url__regex=r".*gnews\.io.*").mock(return_value=httpx.Response(200, json=feed))
    assert await gnews.fetch_gnews_events() == 1
    assert "KEY123" in str(route.calls[0].request.url)  # sent to GNews...
    async with session_factory() as s:
        records = await list_hazards(s)
        assert records[0].hazard_type == "cyclone"
        assert list((await list_links(s)).values()) == ["https://news.example/a1"]
        assert list((await list_contexts(s)).values()) == ["Residents are evacuating."]


@pytest.mark.asyncio
async def test_fetch_gnews_failure_returns_zero_and_never_logs_the_key(monkeypatch, caplog):
    monkeypatch.setattr(settings, "gnews_api_key", "KEY123")

    async def boom(client):
        # httpx's own error text contains the full request URL, key included.
        request = httpx.Request("GET", "https://gnews.io/api/v4/search?apikey=KEY123")
        raise httpx.HTTPStatusError("403 for url https://gnews.io/?apikey=KEY123", request=request,
                                    response=httpx.Response(403, request=request))

    monkeypatch.setattr(gnews, "_fetch", boom)
    with caplog.at_level("DEBUG"):
        assert await gnews.fetch_gnews_events() == 0
    assert "KEY123" not in caplog.text and "403" in caplog.text


# --- date windows --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_since_inclusive_until_exclusive(client, session_factory):
    day = lambda d: datetime(2026, 9, d, 12, 0, tzinfo=timezone.utc)
    async with session_factory() as s:
        await upsert_many(s, [make_event("d1", timestamp=day(1)), make_event("d2", timestamp=day(2)),
                              make_event("d3", timestamp=day(3))])

    async def ids(path, **params):
        return {h["id"] for h in (await client.get(path, params=params)).json()}

    # "2 Sep to 2 Sep" in the picker is since=Sep 2 00:00, until=Sep 3 00:00
    assert await ids("/api/hazards", since="2026-09-02T00:00:00Z", until="2026-09-03T00:00:00Z") == {"d2"}
    assert await ids("/api/hazards", since="2026-09-02T00:00:00Z") == {"d2", "d3"}
    assert await ids("/api/hazards", until="2026-09-03T00:00:00Z") == {"d1", "d2"}
    assert await ids("/api/hazards/prioritized", since="2026-09-01T00:00:00Z", until="2026-09-02T00:00:00Z", limit=50) == {"d1"}
    # explicit window beats `days`
    assert await ids("/api/hazards", days=1, since="2026-09-01T00:00:00Z", until="2026-09-02T00:00:00Z") == {"d1"}

    trend = (await client.get("/api/analytics/trends", params={"since": "2026-09-02T00:00:00Z", "until": "2026-09-04T00:00:00Z"})).json()
    assert [p["date"] for p in trend] == ["2026-09-02", "2026-09-03"]


# --- status endpoint ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_reports_last_data_update(client, session_factory):
    assert (await client.get("/")).json()["last_data_update"] is None
    async with session_factory() as s:
        await upsert_many(s, [make_event("h1")])
    body = (await client.get("/")).json()
    assert body["last_data_update"] is not None and body["active_hazard_count"] == 1


# --- notes: limits, 404, audit -----------------------------------------------------------


def test_note_validation_strips_and_bounds():
    ok = IncidentNoteCreate(note_type="response_log", content="  Evacuated 40 people  ")
    assert ok.content == "Evacuated 40 people"
    with pytest.raises(ValidationError):
        IncidentNoteCreate(note_type="response_log", content="   ")
    with pytest.raises(ValidationError):
        IncidentNoteCreate(note_type="response_log", content="x" * 2001)
    with pytest.raises(ValidationError):
        IncidentNoteCreate(note_type="response_log", content="ok", affected_infrastructure="y" * 201)
    with pytest.raises(ValidationError):
        IncidentNoteCreate(note_type="gossip", content="ok")


@pytest.mark.asyncio
async def test_note_endpoint_404_for_unknown_hazard_and_422_for_bad_body(client, session_factory):
    body = {"note_type": "response_log", "content": "hello"}
    assert (await client.post("/api/incidents/ghost/notes", json=body)).status_code == 404
    async with session_factory() as s:
        await upsert_many(s, [make_event("h1")])
    assert (await client.post("/api/incidents/h1/notes", json={**body, "content": ""})).status_code == 422
    assert (await client.post("/api/incidents/h1/notes", json=body)).status_code == 200


@pytest.mark.asyncio
async def test_adding_a_note_writes_an_audit_entry(session_factory):
    async with session_factory() as s:
        await upsert_many(s, [make_event("h1")])
    async with session_factory() as s:
        await create_incident_note(
            s, "h1", IncidentNoteCreate(note_type="lesson_learned", content="Roads flood first", created_by="sara")
        )
    async with session_factory() as s:
        log = await list_audit_log(s)
    assert log[0].action == "note_added" and log[0].entity_id == "h1"
    assert log[0].details == {"note_type": "lesson_learned"}

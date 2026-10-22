from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx

from app import database as db_module
from app.repository import list_links, upsert_many
from app.schemas import HazardEvent
from app.config import settings
from app.workers import gdacs, gdelt, usgs


def make_event(id_="h1", source="usgs", url=None, days_ago=0, level="Red", loc=None):
    return HazardEvent(
        id=id_, hazard_type="earthquake", location_name=loc or f"Place {id_}", latitude=1.0, longitude=2.0,
        severity_score=6.0, alert_level=level, timestamp=datetime.now(timezone.utc) - timedelta(days=days_ago),
        alert_triggered=True, source=source, url=url,
    )


GOOD_BRIEF = {
    "query": "q", "role": "operator", "schema_valid": True, "raw_output": "{}",
    "structured_brief": {"executive_summary": "Summary text.", "key_impacts": ["Impact"],
                         "recommendations": ["Do thing"], "confidence": 0.6},
    "sources": [], "grounding_score": 0.9, "numbers_grounded": True,
    "domain_constraints_ok": True, "alert_triggered": True,
}


# --- source links -------------------------------------------------------------


@pytest.mark.asyncio
async def test_hazards_carry_links_stored_url_wins_and_never_a_fake_homepage(client, session_factory):
    async with session_factory() as s:
        await upsert_many(s, [
            make_event("us1", "usgs"),  # no stored url -> rebuilt from the id
            make_event("g1", "gdacs", url="https://gdacs.org/specific"),  # stored url wins
            make_event("w1", "open-meteo"),  # no real per-event page: no link at all
        ])
    by_id = {h["id"]: h for h in (await client.get("/api/hazards")).json()}
    assert by_id["us1"]["url"] == "https://earthquake.usgs.gov/earthquakes/eventpage/us1"
    assert by_id["g1"]["url"] == "https://gdacs.org/specific"
    assert by_id["w1"]["url"] is None  # no invented homepage link

    ranked = {r["id"]: r for r in (await client.get("/api/hazards/prioritized")).json()}
    assert ranked["us1"]["url"] and ranked["w1"]["url"] is None


@pytest.mark.asyncio
async def test_reingest_without_url_keeps_the_stored_link(session_factory):
    async with session_factory() as s:
        await upsert_many(s, [make_event("g1", "gdacs", url="https://x.example/a")])
    async with session_factory() as s:
        await upsert_many(s, [make_event("g1", "gdacs", url=None)])
    async with session_factory() as s:
        assert (await list_links(s))["g1"] == "https://x.example/a"


@pytest.mark.asyncio
@respx.mock
async def test_usgs_worker_stores_event_page_url(session_factory, monkeypatch):
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)
    feed = {"features": [{"id": "us1", "properties": {"mag": 6.8, "place": "P", "time": 1750000000000,
                                                       "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us1"},
                          "geometry": {"coordinates": [1, 2, 3]}}]}
    respx.get(url__regex=r".*earthquake\.usgs\.gov.*").mock(return_value=httpx.Response(200, json=feed))
    await usgs.fetch_global_earthquakes()
    async with session_factory() as s:
        assert (await list_links(s))["us1"].endswith("/eventpage/us1")


@pytest.mark.asyncio
@respx.mock
async def test_gdelt_worker_stores_article_url(session_factory, monkeypatch):
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)
    feed = {"articles": [{"title": "Protest in city", "sourcecountry": "France", "url": "https://news.example/story"}]}
    respx.get(url__regex=r".*gdeltproject\.org.*").mock(return_value=httpx.Response(200, json=feed))
    await gdelt.fetch_gdelt_unrest_events()
    async with session_factory() as s:
        assert list((await list_links(s)).values()) == ["https://news.example/story"]


@pytest.mark.asyncio
@respx.mock
async def test_gdacs_worker_stores_item_link(session_factory, monkeypatch):
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)
    xml = """<?xml version="1.0"?><rss xmlns:gdacs="http://www.gdacs.org" xmlns:georss="http://www.georss.org/georss"><channel>
    <item><guid>FL1</guid><title>Flood in Testland</title><link>https://www.gdacs.org/report.aspx?eventid=1</link>
    <gdacs:eventtype>FL</gdacs:eventtype><gdacs:alertlevel>Orange</gdacs:alertlevel><gdacs:alertscore>1.5</gdacs:alertscore>
    <georss:point>1.0 2.0</georss:point><pubDate>Fri, 12 Jun 2026 18:00:00 GMT</pubDate></item></channel></rss>"""
    respx.get(url__regex=r".*gdacs\.org.*").mock(return_value=httpx.Response(200, content=xml.encode()))
    await gdacs.fetch_gdacs_alerts()
    async with session_factory() as s:
        assert (await list_links(s))["FL1"] == "https://www.gdacs.org/report.aspx?eventid=1"


# --- date-range filter ----------------------------------------------------------


@pytest.mark.asyncio
async def test_days_param_limits_hazards_and_prioritized(client, session_factory):
    async with session_factory() as s:
        await upsert_many(s, [make_event("new", days_ago=0), make_event("mid", days_ago=5),
                              make_event("old", days_ago=40)])

    def ids(resp):
        return {h["id"] for h in resp.json()}

    assert ids(await client.get("/api/hazards")) == {"new", "mid", "old"}
    assert ids(await client.get("/api/hazards", params={"days": 1})) == {"new"}
    assert ids(await client.get("/api/hazards", params={"days": 7})) == {"new", "mid"}
    assert ids(await client.get("/api/hazards", params={"days": 30})) == {"new", "mid"}
    assert ids(await client.get("/api/hazards/prioritized", params={"days": 7, "limit": 50})) == {"new", "mid"}


# --- alerts endpoints -----------------------------------------------------------


@pytest.mark.asyncio
async def test_alerts_endpoint_and_config_never_exposes_secrets(client, session_factory, monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_token", "SECRET")
    monkeypatch.setattr(settings, "telegram_chat_id", "1")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_user", "u@example.com")
    monkeypatch.setattr(settings, "smtp_password", "MAILSECRET")
    monkeypatch.setattr(settings, "alert_email_to", "boss@example.com,other@example.com")
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1", level="Red"), make_event("g1", level="Green")])
    feed = (await client.get("/api/alerts")).json()
    assert [f["id"] for f in feed] == ["r1"]
    assert feed[0]["notified_channels"] == []
    cfg = await client.get("/api/alerts/config")
    body = cfg.json()
    assert body["telegram_configured"] is True and body["email_configured"] is True
    assert body["email_recipient_count"] == 2
    for secret in ("SECRET", "MAILSECRET", "boss@example.com"):
        assert secret not in cfg.text


@pytest.mark.asyncio
async def test_alert_test_endpoint_400_when_unconfigured_and_sends_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_token", "")
    monkeypatch.setattr(settings, "telegram_chat_id", "")
    assert (await client.post("/api/alerts/test", json={"channel": "telegram"})).status_code == 400

    monkeypatch.setattr(settings, "telegram_bot_token", "T")
    monkeypatch.setattr(settings, "telegram_chat_id", "1")
    with respx.mock:
        respx.post(url__regex=r".*sendMessage").mock(return_value=httpx.Response(200, json={"ok": True}))
        assert (await client.post("/api/alerts/test", json={"channel": "telegram"})).status_code == 200
    with respx.mock:
        respx.post(url__regex=r".*sendMessage").mock(return_value=httpx.Response(401))
        resp = await client.post("/api/alerts/test", json={"channel": "telegram"})
        assert resp.status_code == 502
        assert "401" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_email_test_endpoint_and_unknown_channel(client, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    assert (await client.post("/api/alerts/test", json={"channel": "email"})).status_code == 400
    assert (await client.post("/api/alerts/test", json={"channel": "fax"})).status_code == 422

    sent = []
    monkeypatch.setattr("app.alerts._send_email_sync", lambda subject, body: sent.append((subject, body)))
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_user", "u@example.com")
    monkeypatch.setattr(settings, "alert_email_to", "a@example.com")
    resp = await client.post("/api/alerts/test", json={"channel": "email"})
    assert resp.status_code == 200 and resp.json()["channel"] == "email"
    assert sent and "[CISE]" in sent[0][0]


# --- reports + export -----------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_report_stores_it_logs_it_and_lists_it(client, session_factory, monkeypatch):
    async def fake_brief(*a, **k):
        return GOOD_BRIEF

    monkeypatch.setattr("app.main.generate_brief", fake_brief)
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1", loc="Quake near Testville")])

    resp = await client.post("/api/reports", json={"report_type": "situation", "actor": "sara"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ai_included"] is True
    assert "Quake near Testville" in body["content"]
    assert "Summary text." in body["content"]

    assert [r["id"] for r in (await client.get("/api/reports")).json()] == [body["id"]]
    assert (await client.get(f"/api/reports/{body['id']}")).json()["title"] == "Situation Report"
    log = (await client.get("/api/audit-log")).json()
    assert log[0]["action"] == "report_generated" and log[0]["actor_name"] == "sara"


@pytest.mark.asyncio
async def test_report_still_generated_when_the_llm_fails(client, session_factory, monkeypatch):
    async def broken(*a, **k):
        raise RuntimeError("ollama down")

    monkeypatch.setattr("app.main.generate_brief", broken)
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1")])
    body = (await client.post("/api/reports", json={"report_type": "executive"})).json()
    assert body["ai_included"] is False
    assert "AI assessment is unavailable" in body["content"]


@pytest.mark.asyncio
async def test_empty_scope_report_does_not_call_the_llm(client, session_factory, monkeypatch):
    calls = []

    async def spy(*a, **k):
        calls.append(1)
        return GOOD_BRIEF

    monkeypatch.setattr("app.main.generate_brief", spy)
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1", loc="Testville")])
    body = (await client.post("/api/reports", json={"report_type": "regional", "scope": "Atlantis"})).json()
    assert calls == []
    assert "No active incidents" in body["content"]


@pytest.mark.asyncio
async def test_unknown_report_404_and_bad_type_422(client):
    assert (await client.get("/api/reports/999")).status_code == 404
    assert (await client.post("/api/reports", json={"report_type": "poem"})).status_code == 422


@pytest.mark.asyncio
async def test_export_endpoint_returns_real_pdf_and_docx(client):
    payload = {"title": "My: Report/1", "markdown": "# Hi\n\n- item with [link](https://example.org)\n"}
    pdf = await client.post("/api/export/pdf", json=payload)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert 'filename="My__Report_1.pdf"' in pdf.headers["content-disposition"]

    docx = await client.post("/api/export/docx", json=payload)
    assert docx.status_code == 200
    assert docx.content.startswith(b"PK")  # a .docx is a zip archive
    assert (await client.post("/api/export/exe", json=payload)).status_code == 404
    too_big = {"title": "t", "markdown": "x" * 200_001}
    assert (await client.post("/api/export/pdf", json=too_big)).status_code == 422

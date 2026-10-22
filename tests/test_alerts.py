import logging
from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx

from app import database
from app.alerts import (
    AlertDeliveryError,
    build_alert_feed,
    dispatch_alerts,
    email_configured,
    format_alert_message,
    format_alert_subject,
    meets_threshold,
    send_email,
    send_telegram,
)
from app.config import settings
from app.models import HazardRecord
from app.repository import apply_review_decision, list_alert_sends, upsert_many
from app.schemas import HazardEvent

TOKEN = "123456:SECRET-TOKEN"


def make_event(id_, level="Red", hours_ago=1, score=7.0):
    return HazardEvent(
        id=id_, hazard_type="earthquake", location_name=f"Place {id_}", latitude=1.0, longitude=2.0,
        severity_score=score, alert_level=level,
        timestamp=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
        alert_triggered=level != "Green", source="usgs",
    )


@pytest.fixture
def telegram(monkeypatch, session_factory):
    monkeypatch.setattr(database, "SessionLocal", session_factory)
    monkeypatch.setattr(settings, "telegram_bot_token", TOKEN)
    monkeypatch.setattr(settings, "telegram_chat_id", "42")
    monkeypatch.setattr(settings, "alert_min_level", "Red")
    monkeypatch.setattr(settings, "alert_max_per_run", 5)
    monkeypatch.setattr(settings, "alert_max_age_hours", 24)
    monkeypatch.setattr(settings, "public_app_url", "https://cise.example")


def test_meets_threshold_orders_levels():
    assert meets_threshold("Red", "Orange")
    assert meets_threshold("Orange", "Orange")
    assert not meets_threshold("Green", "Orange")
    assert not meets_threshold("Orange", "Red")


def test_format_alert_message_has_level_link_and_caveat():
    h = HazardRecord(id="x1", hazard_type="public_unrest", location_name="Somewhere", latitude=0, longitude=0,
                     severity_score=5, alert_level="Red", timestamp=datetime.now(timezone.utc),
                     alert_triggered=True, source="gdelt")
    msg = format_alert_message(h, 82.0, "https://src.example/a", "https://cise.example/")
    assert "RED" in msg and "Public Unrest" in msg
    assert "https://src.example/a" in msg
    assert "https://cise.example/incidents/x1" in msg
    assert "verify" in msg.lower()


@pytest.mark.asyncio
async def test_build_alert_feed_filters_and_marks_notified(session_factory):
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1", "Red"), make_event("o1", "Orange"), make_event("g1", "Green"),
                              make_event("d1", "Red")])
    async with session_factory() as s:
        await apply_review_decision(s, "d1", "dismiss", "sara")
    async with session_factory() as s:
        from sqlalchemy import select
        hazards = list((await s.execute(select(HazardRecord))).scalars().all())
        from app.repository import list_reviews
        reviews = await list_reviews(s)

    feed = build_alert_feed(hazards, reviews, {("r1", "telegram"): datetime.now(timezone.utc)}, {}, "Orange")
    ids = {f["id"] for f in feed}
    assert ids == {"r1", "o1"}  # Green below threshold, d1 dismissed by an analyst
    r1 = next(f for f in feed if f["id"] == "r1")
    assert r1["notified_at"] is not None and r1["notified_channels"] == ["telegram"]
    o1 = next(f for f in feed if f["id"] == "o1")
    assert o1["notified_at"] is None and o1["notified_channels"] == []
    assert all(f["url"] for f in feed)  # these are USGS events: link rebuilt from the id


@pytest.mark.asyncio
@respx.mock
async def test_dispatch_sends_each_alert_once(telegram, session_factory):
    route = respx.post(url__regex=r"https://api\.telegram\.org/bot.*/sendMessage").mock(
        return_value=httpx.Response(200, json={"ok": True})
    )
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1", "Red"), make_event("o1", "Orange")])

    assert await dispatch_alerts() == 1  # only the Red; Orange is below ALERT_MIN_LEVEL
    assert route.call_count == 1
    assert await dispatch_alerts() == 0  # already delivered - never sent twice
    assert route.call_count == 1
    async with session_factory() as s:
        assert set(await list_alert_sends(s)) == {("r1", "telegram")}


@pytest.mark.asyncio
@respx.mock
async def test_dispatch_skips_dismissed_old_and_respects_per_run_cap(telegram, session_factory, monkeypatch):
    monkeypatch.setattr(settings, "alert_max_per_run", 2)
    route = respx.post(url__regex=r".*sendMessage").mock(return_value=httpx.Response(200, json={"ok": True}))
    async with session_factory() as s:
        await upsert_many(s, [make_event("a", hours_ago=1), make_event("b", hours_ago=2), make_event("c", hours_ago=3),
                              make_event("old", hours_ago=72), make_event("dis", hours_ago=1)])
    async with session_factory() as s:
        await apply_review_decision(s, "dis", "dismiss", "sara")

    assert await dispatch_alerts() == 2  # capped
    assert await dispatch_alerts() == 1  # the remaining recent one
    assert route.call_count == 3
    async with session_factory() as s:
        sent = {hazard_id for hazard_id, _channel in await list_alert_sends(s)}
    assert sent == {"a", "b", "c"}  # not 'old' (too old) and not 'dis' (dismissed)


@pytest.mark.asyncio
async def test_dispatch_does_nothing_when_telegram_not_configured(monkeypatch, session_factory):
    monkeypatch.setattr(database, "SessionLocal", session_factory)
    monkeypatch.setattr(settings, "telegram_bot_token", "")
    monkeypatch.setattr(settings, "telegram_chat_id", "")
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1")])
    assert await dispatch_alerts() == 0
    async with session_factory() as s:
        assert await list_alert_sends(s) == {}


@pytest.mark.asyncio
@respx.mock
async def test_failed_delivery_records_nothing_and_never_leaks_the_token(telegram, session_factory, caplog):
    respx.post(url__regex=r".*sendMessage").mock(return_value=httpx.Response(401, json={"ok": False}))
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1")])

    with caplog.at_level(logging.DEBUG):
        assert await dispatch_alerts() == 0
    async with session_factory() as s:
        assert await list_alert_sends(s) == {}  # will be retried next run
    assert TOKEN not in caplog.text


@pytest.mark.asyncio
@respx.mock
async def test_send_telegram_error_message_does_not_contain_token(telegram):
    respx.post(url__regex=r".*sendMessage").mock(return_value=httpx.Response(500))
    with pytest.raises(AlertDeliveryError) as exc:
        await send_telegram("hi")
    assert TOKEN not in str(exc.value)
    assert "500" in str(exc.value)


# --- email channel ---------------------------------------------------------------


class FakeSMTP:
    """Stands in for smtplib.SMTP so no real mail server is needed."""

    sent: list = []
    log: list = []
    fail_login = False

    def __init__(self, host, port, timeout=None, **kwargs):
        self.log.append(("connect", host, port))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def ehlo(self):
        pass

    def starttls(self, context=None):
        self.log.append(("starttls",))

    def login(self, user, password):
        if self.fail_login:
            import smtplib

            raise smtplib.SMTPAuthenticationError(535, b"bad credentials for secret-password")
        self.log.append(("login", user))

    def send_message(self, message):
        self.sent.append(message)


@pytest.fixture
def smtp(monkeypatch, session_factory):
    FakeSMTP.sent, FakeSMTP.log, FakeSMTP.fail_login = [], [], False
    monkeypatch.setattr(database, "SessionLocal", session_factory)
    monkeypatch.setattr("app.alerts.smtplib.SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "telegram_bot_token", "")
    monkeypatch.setattr(settings, "telegram_chat_id", "")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_user", "me@example.com")
    monkeypatch.setattr(settings, "smtp_password", "secret-password")
    monkeypatch.setattr(settings, "smtp_security", "starttls")
    monkeypatch.setattr(settings, "smtp_from", "")
    monkeypatch.setattr(settings, "alert_email_to", "a@example.com, b@example.com")
    monkeypatch.setattr(settings, "alert_min_level", "Red")
    monkeypatch.setattr(settings, "alert_max_per_run", 5)
    monkeypatch.setattr(settings, "alert_max_age_hours", 24)
    monkeypatch.setattr(settings, "public_app_url", "https://cise.example")
    return FakeSMTP


def test_email_configured_needs_host_recipients_and_sender(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "h")
    monkeypatch.setattr(settings, "alert_email_to", "a@x.com")
    monkeypatch.setattr(settings, "smtp_user", "u")
    monkeypatch.setattr(settings, "smtp_from", "")
    assert email_configured()
    monkeypatch.setattr(settings, "alert_email_to", " , ")
    assert not email_configured()
    monkeypatch.setattr(settings, "alert_email_to", "a@x.com")
    monkeypatch.setattr(settings, "smtp_user", "")
    assert not email_configured()  # no sender at all
    monkeypatch.setattr(settings, "smtp_from", "cise@x.com")
    assert email_configured()


def test_subject_is_a_single_short_line():
    h = HazardRecord(id="x", hazard_type="earthquake", location_name="Line one\nBcc: evil@x.com " + "z" * 300,
                     latitude=0, longitude=0, severity_score=5, alert_level="Red",
                     timestamp=datetime.now(timezone.utc), alert_triggered=True, source="usgs")
    subject = format_alert_subject(h)
    assert "\n" not in subject and len(subject) <= 150
    assert subject.startswith("[CISE] RED alert: Earthquake")


@pytest.mark.asyncio
async def test_email_dispatch_sends_once_to_all_recipients(smtp, session_factory):
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1", "Red"), make_event("o1", "Orange")])

    assert await dispatch_alerts() == 1
    assert len(smtp.sent) == 1
    message = smtp.sent[0]
    assert message["To"] == "a@example.com, b@example.com"
    assert message["From"] == "me@example.com"  # falls back to SMTP_USER
    assert "RED alert" in message["Subject"]
    assert "https://cise.example/incidents/r1" in message.get_content()
    assert ("starttls",) in smtp.log and ("login", "me@example.com") in smtp.log

    assert await dispatch_alerts() == 0  # never emailed twice
    async with session_factory() as s:
        assert set(await list_alert_sends(s)) == {("r1", "email")}


@pytest.mark.asyncio
async def test_email_login_failure_records_nothing_and_never_leaks_password(smtp, session_factory, caplog):
    smtp.fail_login = True
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1")])
    with caplog.at_level(logging.DEBUG):
        assert await dispatch_alerts() == 0
    async with session_factory() as s:
        assert await list_alert_sends(s) == {}
    assert "secret-password" not in caplog.text

    with pytest.raises(AlertDeliveryError) as exc:
        await send_email("s", "b")
    assert "secret-password" not in str(exc.value)


@pytest.mark.asyncio
@respx.mock
async def test_both_channels_track_sends_independently(smtp, session_factory, monkeypatch):
    """Telegram turned on after email already sent: only Telegram fires."""
    async with session_factory() as s:
        await upsert_many(s, [make_event("r1")])
    assert await dispatch_alerts() == 1  # email only

    monkeypatch.setattr(settings, "telegram_bot_token", TOKEN)
    monkeypatch.setattr(settings, "telegram_chat_id", "42")
    route = respx.post(url__regex=r".*sendMessage").mock(return_value=httpx.Response(200, json={"ok": True}))
    assert await dispatch_alerts() == 1  # telegram only; email is not repeated
    assert route.call_count == 1 and len(smtp.sent) == 1
    async with session_factory() as s:
        assert set(await list_alert_sends(s)) == {("r1", "email"), ("r1", "telegram")}

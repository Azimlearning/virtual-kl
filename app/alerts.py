"""Alert delivery: Telegram and email.

A scheduler job (dispatch_alerts) looks for hazards at/above ALERT_MIN_LEVEL
that are recent, not dismissed by an analyst, and not yet sent on a channel,
then sends each one and records it in alert_sends so it is never sent twice
on the same channel. A hazard an analyst dismissed as a false positive is
never sent - that is the human-in-the-loop decision doing its job. Each
channel is independent: one failing (say, a wrong password) never blocks
the other.

HOW TO SET UP TELEGRAM (one-off, ~5 minutes, done by you, not by code):
  1. In Telegram, chat with @BotFather -> /newbot -> copy the bot token.
  2. Open a chat with your new bot and send it any message ("hi").
  3. In a browser open https://api.telegram.org/bot<TOKEN>/getUpdates and
     copy the number after "chat":{"id": (that is your chat id).
  4. Put TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in your .env.

HOW TO SET UP EMAIL (example: Gmail):
  1. In your Google account, turn on 2-Step Verification (Security page).
  2. On the same page search for "App passwords" and create one named CISE.
     Google shows a 16-character password once: copy it (this is NOT your
     normal Gmail password, and you can delete it any time).
  3. Put these in your .env:
        SMTP_HOST=smtp.gmail.com
        SMTP_PORT=587
        SMTP_USER=you@gmail.com
        SMTP_PASSWORD=<the 16-character app password>
        ALERT_EMAIL_TO=you@gmail.com,teammate@example.com
     Other providers work the same way with their own SMTP host/port
     (use SMTP_SECURITY=ssl with port 465 if the provider asks for it).

If a channel's settings are blank, that channel is skipped gracefully
(nothing crashes) - same pattern as ACLED.
"""

import asyncio
import logging
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import httpx

from . import database
from .config import settings
from .http_client import get_client
from .links import resolve_url
from .priority import compute_priority_score, priority_label
from .repository import (
    list_alert_sends,
    list_hazards,
    list_links,
    list_reviews,
    record_alert_send,
)

logger = logging.getLogger(__name__)

# httpx logs every request URL at INFO level, and Telegram's URL contains the
# bot token ("/bot<TOKEN>/sendMessage") - that would write your secret into
# the logs. Raising httpx's log level to WARNING keeps the token out of them.
logging.getLogger("httpx").setLevel(logging.WARNING)

_LEVEL_RANK = {"green": 0, "orange": 1, "red": 2}
CHANNELS = ("telegram", "email")


class AlertDeliveryError(Exception):
    """Delivery failed. The message is safe to log/show: it never contains
    the Telegram URL (which embeds the bot token) or the SMTP password."""


def meets_threshold(level: str, min_level: str) -> bool:
    return _LEVEL_RANK.get(str(level).lower(), 0) >= _LEVEL_RANK.get(str(min_level).lower(), 2)


# --- Which channels are set up ------------------------------------------------


def telegram_configured() -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def email_recipients() -> list[str]:
    return [a.strip() for a in settings.alert_email_to.split(",") if a.strip()]


def email_configured() -> bool:
    return bool(settings.smtp_host and email_recipients() and (settings.smtp_from or settings.smtp_user))


def configured_channels() -> list[str]:
    channels = []
    if telegram_configured():
        channels.append("telegram")
    if email_configured():
        channels.append("email")
    return channels


def _aware(dt: datetime) -> datetime:
    # SQLite (used in tests) hands back naive datetimes, Postgres aware ones.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# --- Message text -------------------------------------------------------------


def format_alert_message(hazard, score: float, url: str | None, app_url: str = "") -> str:
    label = hazard.hazard_type.replace("_", " ").title()
    lines = [
        f"CISE ALERT - {str(hazard.alert_level).upper()}",
        f"{label}: {hazard.location_name}",
        f"Priority {score:.0f}/100 ({priority_label(score)}) | source: {hazard.source}",
    ]
    if url:
        lines.append(f"Source: {url}")
    if app_url:
        lines.append(f"Open in CISE: {app_url.rstrip('/')}/incidents/{hazard.id}")
    lines.append("AI-assisted early warning - verify before acting.")
    return "\n".join(lines)


def format_alert_subject(hazard) -> str:
    label = hazard.hazard_type.replace("_", " ").title()
    subject = f"[CISE] {str(hazard.alert_level).upper()} alert: {label} - {hazard.location_name}"
    # One line only: a newline in a header would let feed text inject extra
    # email headers, and long subjects are truncated by mail clients anyway.
    return " ".join(subject.split())[:150]


# --- Sending ------------------------------------------------------------------


async def send_telegram(text: str) -> None:
    if not telegram_configured():
        raise AlertDeliveryError("Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).")
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with get_client() as client:
            response = await client.post(
                url,
                json={"chat_id": settings.telegram_chat_id, "text": text, "disable_web_page_preview": True},
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        # exc's own message embeds the URL (and so the token) - don't pass it on.
        raise AlertDeliveryError(f"Telegram rejected the message (HTTP {exc.response.status_code}).") from None
    except httpx.HTTPError as exc:
        raise AlertDeliveryError(f"Could not reach Telegram ({type(exc).__name__}).") from None


def _send_email_sync(subject: str, body: str) -> None:
    """Blocking SMTP send (smtplib is a synchronous library), so callers run
    it in a worker thread - same reasoning as the Chroma and Ollama clients."""
    message = EmailMessage()
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = ", ".join(email_recipients())
    message["Subject"] = " ".join(subject.split())
    message.set_content(body)

    security = settings.smtp_security.lower()
    context = ssl.create_default_context()
    if security == "ssl":
        server: smtplib.SMTP = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20, context=context)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
    with server:
        server.ehlo()
        if security not in ("ssl", "none"):
            server.starttls(context=context)
            server.ehlo()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


async def send_email(subject: str, body: str) -> None:
    if not email_configured():
        raise AlertDeliveryError("Email is not configured (SMTP_HOST, ALERT_EMAIL_TO and SMTP_USER/SMTP_FROM).")
    try:
        await asyncio.to_thread(_send_email_sync, subject, body)
    except smtplib.SMTPAuthenticationError:
        raise AlertDeliveryError(
            "The email server rejected the login. Check SMTP_USER / SMTP_PASSWORD (Gmail needs an app password)."
        ) from None
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        # The exception text can contain server details; report only its type.
        raise AlertDeliveryError(f"Could not send the email ({type(exc).__name__}).") from None


async def send_test(channel: str) -> None:
    if channel == "telegram":
        await send_telegram("CISE test message: Telegram alert delivery is working.")
    elif channel == "email":
        await send_email("[CISE] Test message", "CISE test message: email alert delivery is working.")
    else:
        raise AlertDeliveryError(f"Unknown channel: {channel}")


# --- The alert feed + the scheduled job ------------------------------------------


def build_alert_feed(
    hazards, reviews: dict, sent: dict, links: dict, min_level: str, limit: int = 50
) -> list[dict]:
    """Pure function behind GET /api/alerts: alert-level hazards that are
    still active (not dismissed), newest first, each with which channels it
    has been pushed out on (`sent` maps (hazard id, channel) -> when)."""
    feed = []
    for h in hazards:
        if not meets_threshold(h.alert_level, min_level):
            continue
        review = reviews.get(h.id)
        if review is not None and review.status == "dismissed":
            continue
        score = (
            float(review.severity_override)
            if review is not None and review.severity_override is not None
            else compute_priority_score(h.severity_score, h.alert_level, h.source)
        )
        notified = {ch: sent[(h.id, ch)] for ch in CHANNELS if (h.id, ch) in sent}
        feed.append(
            {
                "id": h.id,
                "hazard_type": h.hazard_type,
                "location_name": h.location_name,
                "alert_level": h.alert_level,
                "source": h.source,
                "timestamp": h.timestamp,
                "priority_score": round(score, 1),
                "priority_label": priority_label(score),
                "url": resolve_url(h.source, h.id, links.get(h.id)),
                "notified_channels": list(notified),
                "notified_at": max(notified.values(), key=_aware) if notified else None,
            }
        )
    feed.sort(key=lambda item: _aware(item["timestamp"]), reverse=True)
    return feed[:limit]


async def _deliver(channel: str, hazard, item: dict) -> None:
    text = format_alert_message(hazard, item["priority_score"], item["url"], settings.public_app_url)
    if channel == "telegram":
        await send_telegram(text)
    else:
        await send_email(format_alert_subject(hazard), text)


async def dispatch_alerts() -> int:
    """Scheduler job. Returns how many messages were sent this run (across
    all channels)."""
    channels = configured_channels()
    if not channels:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.alert_max_age_hours)
    async with database.SessionLocal() as session:
        hazards = await list_hazards(session, limit=1000)
        reviews = await list_reviews(session)
        sent = await list_alert_sends(session)
        links = await list_links(session)

    feed = build_alert_feed(hazards, reviews, sent, links, settings.alert_min_level, limit=1000)
    recent = [h for h in feed if _aware(h["timestamp"]) >= cutoff]
    by_id = {h.id: h for h in hazards}

    total = 0
    for channel in channels:
        pending = [h for h in recent if channel not in h["notified_channels"]]
        for item in pending[: settings.alert_max_per_run]:
            try:
                await _deliver(channel, by_id[item["id"]], item)
            except AlertDeliveryError as exc:
                # Likely a config problem (bad token/password) - stop this
                # channel rather than repeating the same failure for every
                # pending alert. The other channel still gets its turn.
                logger.warning("[Alerts] %s delivery failed, stopping this run: %s", channel, exc)
                break
            async with database.SessionLocal() as session:
                await record_alert_send(session, item["id"], channel)
            total += 1

    if total:
        logger.info("[Alerts] sent %d alert message(s)", total)
    return total

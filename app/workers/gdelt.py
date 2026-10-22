import hashlib
import logging
import re
from datetime import datetime, timezone

import httpx

from .. import database
from ..config import settings
from ..geocode import locate_text, lookup as geocode_lookup
from ..http_client import get_client, with_retry
from ..impact import estimate_impact
from ..repository import upsert_many
from ..schemas import HazardEvent

logger = logging.getLogger(__name__)

# GDELT's `artlist` mode (the mode this worker actually uses - see the
# earlier fix from `updatesjson`) does not reliably expose a per-article
# tone/sentiment field; that data lives in GDELT's separate GKG dataset,
# not the DOC 2.0 API response used here. Rather than depend on an
# unverified field that may silently be absent, sentiment is computed
# locally from the article title using a small, transparent lexicon. This
# is a deliberately simple stand-in for the "sentiment score" Table 3
# names - documented here as a known scope decision, not GDELT's own tone
# score.
_NEGATIVE_WORDS = {
    "killed", "dead", "death", "riot", "violence", "attack", "crisis",
    "collapse", "flee", "disaster", "injured", "clash", "unrest", "protest",
    "casualties", "destroyed", "emergency", "chaos", "deadly", "crackdown",
}
_POSITIVE_WORDS = {
    "recovery", "aid", "rescue", "resolved", "peace", "stable", "calm",
    "restored", "safe", "relief", "ceasefire",
}
_WORD_PATTERN = re.compile(r"[a-z]+")


def score_sentiment(text: str) -> float:
    """Returns a score from -1.0 (very negative) to +1.0 (very positive);
    0.0 when no lexicon words are present (neutral/unknown, not "positive").
    """
    words = _WORD_PATTERN.findall(text.lower())
    if not words:
        return 0.0
    negative = sum(1 for w in words if w in _NEGATIVE_WORDS)
    positive = sum(1 for w in words if w in _POSITIVE_WORDS)
    total = negative + positive
    if total == 0:
        return 0.0
    return round((positive - negative) / total, 2)


@with_retry
async def _fetch(client: httpx.AsyncClient) -> dict:
    response = await client.get(settings.gdelt_url)
    response.raise_for_status()
    return response.json()


def _stable_id(article: dict) -> str:
    # The prototype used f"unrest_{date}_{index}", which meant slot 0-9
    # got overwritten on every poll instead of accumulating history, and
    # two different articles could collide on the same id. Hash the
    # article URL (falling back to title+source) instead so the same
    # article always maps to the same row, and different articles don't
    # collide.
    key = article.get("url") or f"{article.get('title', '')}|{article.get('sourcecountry', '')}"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"unrest_{digest}"


async def fetch_gdelt_unrest_events() -> int:
    """Polls GDELT's real-time doc API, tracking civil unrest patterns.

    NOTE: this worker's live behavior against GDELT's actual response shape
    could not be verified in this environment (no network access). Log the
    raw response once via LOG_LEVEL=DEBUG on your machine and confirm the
    `articles` field name still matches before relying on this in a demo.
    """
    logger.info("[GDELT] polling public-unrest doc stream")

    try:
        async with get_client() as client:
            data = await _fetch(client)
    except Exception:
        logger.exception("[GDELT] fetch failed after retries")
        return 0

    articles = (data.get("articles") or [])[:10]
    events: list[HazardEvent] = []

    for article in articles:
        title = article.get("title") or "Civil Disturbance Reported"
        source_country = article.get("sourcecountry") or "Global"
        # Prefer a place the headline NAMES; the publisher's country is only
        # a fallback (a UK paper writing about Ukraine is not a UK event).
        place = locate_text(title)
        if place:
            lat, lon, where = place.lat, place.lon, place.label
        else:
            lat, lon = geocode_lookup(source_country)
            where = source_country

        events.append(
            HazardEvent(
                id=_stable_id(article),
                hazard_type="public_unrest",
                location_name=f"{title} ({where})",
                latitude=lat,
                longitude=lon,
                severity_score=5.0,  # base severity weight for an active media spike
                alert_level="Orange",
                timestamp=datetime.now(timezone.utc),
                alert_triggered=True,
                source="gdelt",
                url=article.get("url"),
                estimated_impact=estimate_impact("Orange"),
                sentiment_score=score_sentiment(title),
            )
        )

    async with database.SessionLocal() as session:
        count = await upsert_many(session, events)

    logger.info("[GDELT] synced %d unrest events", count)
    return count

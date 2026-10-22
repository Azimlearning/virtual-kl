"""News headlines as an extra context source (GNews, https://gnews.io).

Why: USGS/GDACS/Open-Meteo give numbers, not stories. A news article gives
the AI a sentence of real-world context ("flash floods cut off three
districts...") and covers places the structured feeds miss.

Honest limits (state these in the dissertation):
  * Keyword matching, not understanding: "protest" in a headline makes it a
    public_unrest event. Alert levels are Green by default and Orange only
    when several severity words appear - never Red, because a headline alone
    is not enough evidence for the top tier. Analysts confirm or dismiss.
  * Location comes from the gazetteer (app/geocode.py). An article naming no
    known place is skipped rather than pinned to a guess.
  * GNews free plan: 100 requests/day, ~12h article delay, NON-COMMERCIAL
    use. One request per 30 min is 48/day.
  * Skips quietly if GNEWS_API_KEY is empty.
"""

import hashlib
import logging
from datetime import datetime, timezone

import httpx

from .. import database
from ..config import settings
from ..geocode import locate_text
from ..http_client import get_client, with_retry
from ..impact import estimate_impact
from ..repository import upsert_many
from ..schemas import HazardEvent

logger = logging.getLogger(__name__)

# First match wins, so list the most specific types first.
_TYPE_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("earthquake", ("earthquake", "tremor", "aftershock", "seismic")),
    ("volcano", ("volcano", "volcanic", "eruption")),
    ("cyclone", ("cyclone", "typhoon", "hurricane", "tropical storm")),
    ("flood", ("flood", "flooding", "flash flood", "landslide", "tsunami")),
    ("wildfire", ("wildfire", "bushfire", "forest fire")),
    ("drought", ("drought", "famine")),
    ("armed_conflict", ("airstrike", "air strike", "shelling", "missile", "offensive", "coup")),
    ("public_unrest", ("protest", "riot", "unrest", "demonstrators", "curfew", "crackdown")),
]

_SEVERE_WORDS = (
    "killed", "dead", "death", "deaths", "deadly", "casualties", "injured", "missing",
    "evacuat", "destroyed", "collapse", "state of emergency", "displaced", "thousands",
)


def classify(text: str) -> str | None:
    lowered = text.lower()
    for hazard_type, words in _TYPE_KEYWORDS:
        if any(w in lowered for w in words):
            return hazard_type
    return None


def severity_for(text: str) -> tuple[float, str]:
    """(severity_score, alert_level): Green 1.0 by default, Orange when two
    or more severity words appear. Never Red from a headline alone."""
    lowered = text.lower()
    hits = sum(1 for w in _SEVERE_WORDS if w in lowered)
    if hits >= 2:
        return min(4.0 + hits * 0.5, 7.0), "Orange"
    return 1.0, "Green"


def _stable_id(url: str) -> str:
    return "news_" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def _parse_time(value: str | None) -> datetime:
    if value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def build_event(article: dict) -> HazardEvent | None:
    """One GNews article -> a HazardEvent, or None if it is unusable
    (no URL/title, no hazard keyword, or no recognisable place)."""
    url = (article.get("url") or "").strip()
    title = (article.get("title") or "").strip()
    if not url or not title:
        return None
    description = (article.get("description") or "").strip()

    hazard_type = classify(f"{title} {description}")
    if hazard_type is None:
        return None
    place = locate_text(title) or locate_text(description)
    if place is None:
        return None

    severity, level = severity_for(f"{title} {description}")
    return HazardEvent(
        id=_stable_id(url),
        hazard_type=hazard_type,
        location_name=f"{title} ({place.label})",
        latitude=place.lat,
        longitude=place.lon,
        severity_score=severity,
        alert_level=level,
        timestamp=_parse_time(article.get("publishedAt")),
        alert_triggered=level != "Green",
        source="gnews",
        url=url,
        estimated_impact=estimate_impact(level),
        context=description or None,
    )


@with_retry
async def _fetch(client: httpx.AsyncClient) -> dict:
    response = await client.get(
        settings.gnews_url,
        params={
            "q": settings.gnews_query,
            "lang": "en",
            "max": 10,
            "sortby": "publishedAt",
            "apikey": settings.gnews_api_key,
        },
    )
    response.raise_for_status()
    return response.json()


async def fetch_gnews_events() -> int:
    if not settings.gnews_api_key:
        logger.info("[GNews] no GNEWS_API_KEY set, skipping")
        return 0

    try:
        async with get_client() as client:
            data = await _fetch(client)
    except httpx.HTTPStatusError as exc:
        # Log the status only: the request URL contains the API key.
        logger.error("[GNews] fetch failed with HTTP %s", exc.response.status_code)
        return 0
    except Exception as exc:
        logger.error("[GNews] fetch failed: %s", type(exc).__name__)
        return 0

    events = [e for e in (build_event(a) for a in data.get("articles") or []) if e is not None]
    if not events:
        return 0
    async with database.SessionLocal() as session:
        count = await upsert_many(session, events)
    logger.info("[GNews] synced %d news events", count)
    return count

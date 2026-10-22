"""ACLED (Armed Conflict Location & Event Data) worker.

Named alongside GDELT in the original data-source table, but unlike
GDELT, ACLED requires free registration (email + API key) at
acleddata.com - it isn't open access. This worker is written against
ACLED's commonly-documented field names (event_type, latitude,
longitude, fatalities, notes, etc.) but has NOT been verified against a
live response, since no credentials were available while building this.
First thing to do once registered: run a manual request and confirm the
field names below still match - same "verify before trusting" step that
caught the GDELT `mode=updatesjson` bug earlier in this project.
"""

import logging
from datetime import datetime, timezone

import httpx

from .. import database
from ..config import settings
from ..http_client import get_client, with_retry
from ..impact import estimate_impact
from ..repository import upsert_many
from ..schemas import HazardEvent

logger = logging.getLogger(__name__)

# ACLED event_type values -> our unified hazard_type. Anything not listed
# falls back to "public_unrest".
ACLED_TYPE_MAP = {
    "Battles": "armed_conflict",
    "Violence against civilians": "armed_conflict",
    "Explosions/Remote violence": "armed_conflict",
    "Protests": "public_unrest",
    "Riots": "public_unrest",
    "Strategic developments": "public_unrest",
}


def _credentials_configured() -> bool:
    return bool(settings.acled_api_key and settings.acled_email)


@with_retry
async def _fetch(client: httpx.AsyncClient) -> dict:
    response = await client.get(
        settings.acled_url,
        params={
            "key": settings.acled_api_key,
            "email": settings.acled_email,
            "limit": 50,
        },
    )
    response.raise_for_status()
    return response.json()


def _alert_level(fatalities: int) -> str:
    if fatalities >= 10:
        return "Red"
    if fatalities >= 1:
        return "Orange"
    return "Green"


async def fetch_acled_events() -> int:
    if not _credentials_configured():
        logger.info("[ACLED] no credentials configured (ACLED_API_KEY/ACLED_EMAIL) - skipping")
        return 0

    logger.info("[ACLED] polling conflict-event feed")
    try:
        async with get_client() as client:
            data = await _fetch(client)
    except Exception:
        logger.exception("[ACLED] fetch failed after retries")
        return 0

    events: list[HazardEvent] = []
    for record in data.get("data", []):
        try:
            fatalities = int(record.get("fatalities", 0) or 0)
        except (TypeError, ValueError):
            fatalities = 0
        alert_lvl = _alert_level(fatalities)
        event_type = record.get("event_type", "")
        hazard_type = ACLED_TYPE_MAP.get(event_type, "public_unrest")

        event_id = record.get("event_id_cnty") or f"acled_{record.get('data_id', 'unknown')}"
        location = record.get("location") or record.get("country") or "Unknown location"

        try:
            lat = float(record.get("latitude", 0.0) or 0.0)
            lon = float(record.get("longitude", 0.0) or 0.0)
        except (TypeError, ValueError):
            lat, lon = 0.0, 0.0

        events.append(
            HazardEvent(
                id=event_id,
                hazard_type=hazard_type,
                location_name=f"{event_type or 'Conflict event'} in {location}",
                latitude=lat,
                longitude=lon,
                severity_score=float(fatalities),
                alert_level=alert_lvl,
                timestamp=datetime.now(timezone.utc),
                alert_triggered=alert_lvl in ("Orange", "Red"),
                source="acled",
                estimated_impact=estimate_impact(alert_lvl),
            )
        )

    async with database.SessionLocal() as session:
        count = await upsert_many(session, events)

    logger.info("[ACLED] synced %d events", count)
    return count

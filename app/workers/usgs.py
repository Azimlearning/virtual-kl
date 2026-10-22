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


@with_retry
async def _fetch(client: httpx.AsyncClient) -> dict:
    response = await client.get(settings.usgs_url)
    response.raise_for_status()
    return response.json()


def _alert_level(mag: float) -> str:
    if mag < 5.5:
        return "Green"
    if mag < 6.5:
        return "Orange"
    return "Red"


async def fetch_global_earthquakes() -> int:
    """Polls real-time seismological data from USGS and upserts into the DB."""
    logger.info("[USGS] polling earthquake feed")

    try:
        async with get_client() as client:
            data = await _fetch(client)
    except Exception:
        logger.exception("[USGS] fetch failed after retries")
        return 0

    events: list[HazardEvent] = []
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        coords = (feature.get("geometry") or {}).get("coordinates") or [0.0, 0.0, 0.0]
        mag = props.get("mag") if props.get("mag") is not None else 0.0
        alert_lvl = _alert_level(mag)
        epoch_time = (props.get("time") or 0) / 1000.0

        events.append(
            HazardEvent(
                id=feature.get("id", "unknown"),
                hazard_type="earthquake",
                location_name=props.get("place") or "Unknown Seismic Location",
                longitude=coords[0],
                latitude=coords[1],
                severity_score=mag,
                alert_level=alert_lvl,
                timestamp=datetime.fromtimestamp(epoch_time, tz=timezone.utc),
                alert_triggered=alert_lvl in ("Orange", "Red"),
                source="usgs",
                url=props.get("url"),
                estimated_impact=estimate_impact(alert_lvl),
            )
        )

    async with database.SessionLocal() as session:
        count = await upsert_many(session, events)

    logger.info("[USGS] synced %d events", count)
    return count

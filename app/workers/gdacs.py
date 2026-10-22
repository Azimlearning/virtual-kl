import logging
from datetime import datetime, timezone

import httpx
from defusedxml import ElementTree as ET

from .. import database
from ..config import settings
from ..http_client import get_client, with_retry
from ..impact import estimate_impact
from ..repository import upsert_many
from ..schemas import HazardEvent

logger = logging.getLogger(__name__)

NAMESPACES = {
    "gdacs": "http://www.gdacs.org",
    "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#",
}
GEORSS_POINT = "{http://www.georss.org/georss}point"

HAZARD_MAP = {
    "eq": "earthquake",
    "tc": "cyclone",
    "fl": "flood",
    "vo": "volcano",
    "dr": "drought",
    "wf": "wildfire",
}


@with_retry
async def _fetch(client: httpx.AsyncClient) -> bytes:
    response = await client.get(settings.gdacs_url)
    response.raise_for_status()
    return response.content


def _parse_timestamp(item) -> datetime:
    pub_date_el = item.find("pubDate")
    if pub_date_el is not None and pub_date_el.text:
        try:
            # RFC 822, e.g. "Fri, 12 Jun 2026 18:00:00 GMT"
            return datetime.strptime(pub_date_el.text.strip(), "%a, %d %b %Y %H:%M:%S %Z").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            logger.warning("[GDACS] unparseable pubDate %r, falling back to now()", pub_date_el.text)
    return datetime.now(timezone.utc)


async def fetch_gdacs_alerts() -> int:
    """Polls and parses GDACS's multi-hazard RSS/XML feed (excludes earthquakes,
    which are already tracked via USGS).
    """
    logger.info("[GDACS] polling RSS/XML feed")

    try:
        async with get_client() as client:
            content = await _fetch(client)
    except Exception:
        logger.exception("[GDACS] fetch failed after retries")
        return 0

    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        logger.exception("[GDACS] malformed XML response")
        return 0

    events: list[HazardEvent] = []
    for item in root.findall(".//item"):
        guid_el = item.find("guid")
        event_id = guid_el.text if guid_el is not None and guid_el.text else "unknown_gdacs"

        h_type_el = item.find("gdacs:eventtype", NAMESPACES)
        raw_type = h_type_el.text.lower() if h_type_el is not None and h_type_el.text else "unknown"
        h_type = HAZARD_MAP.get(raw_type, raw_type)

        if h_type == "earthquake":
            continue  # deduplicated against USGS

        title_el = item.find("title")
        title = title_el.text if title_el is not None and title_el.text else "Global Hazard Event"

        georss_el = item.find(GEORSS_POINT)
        if georss_el is not None and georss_el.text:
            try:
                lat_str, lon_str = georss_el.text.strip().split()
                lat, lon = float(lat_str), float(lon_str)
            except (ValueError, AttributeError):
                lat, lon = 0.0, 0.0
        else:
            lat, lon = 0.0, 0.0

        link_el = item.find("link")
        link = link_el.text.strip() if link_el is not None and link_el.text else None

        alert_lvl_el = item.find("gdacs:alertlevel", NAMESPACES)
        alert_lvl = alert_lvl_el.text.capitalize() if alert_lvl_el is not None and alert_lvl_el.text else "Green"

        score_el = item.find("gdacs:alertscore", NAMESPACES)
        try:
            score = float(score_el.text) if score_el is not None and score_el.text else 0.0
        except ValueError:
            score = 0.0

        events.append(
            HazardEvent(
                id=event_id,
                hazard_type=h_type,
                location_name=title,
                latitude=lat,
                longitude=lon,
                severity_score=score,
                alert_level=alert_lvl,
                timestamp=_parse_timestamp(item),
                alert_triggered=alert_lvl in ("Orange", "Red"),
                source="gdacs",
                url=link,
                estimated_impact=estimate_impact(alert_lvl),
            )
        )

    async with database.SessionLocal() as session:
        count = await upsert_many(session, events)

    logger.info("[GDACS] synced %d events", count)
    return count

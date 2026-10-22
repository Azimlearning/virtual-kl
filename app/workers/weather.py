import asyncio
import logging
import statistics
from datetime import date, datetime, timedelta, timezone

import httpx

from .. import database
from ..config import settings
from ..http_client import get_client, with_retry
from ..impact import estimate_impact
from ..repository import upsert_many
from ..schemas import HazardEvent

logger = logging.getLogger(__name__)

# Monitored cities: a spread across every inhabited region so the map is not
# Malaysia-and-friends only. Each entry is polled independently. Kept to ~40
# because Open-Meteo's free tier allows roughly 10,000 calls a day: 40 cities
# every 30 minutes is ~1,900 calls/day, whereas every 5 minutes would be ~11,500.
_CITY_COORDS = [
    ("Kuala Lumpur, Malaysia", 3.1390, 101.6869), ("Tokyo, Japan", 35.6762, 139.6503),
    ("Jakarta, Indonesia", -6.2088, 106.8456), ("Miami, USA", 25.7617, -80.1918),
    ("London, UK", 51.5074, -0.1278), ("Manila, Philippines", 14.5995, 120.9842),
    ("Bangkok, Thailand", 13.7563, 100.5018), ("Hanoi, Vietnam", 21.0278, 105.8342),
    ("Singapore, Singapore", 1.3521, 103.8198), ("Dhaka, Bangladesh", 23.8103, 90.4125),
    ("Mumbai, India", 19.0760, 72.8777), ("New Delhi, India", 28.6139, 77.2090),
    ("Karachi, Pakistan", 24.8607, 67.0011), ("Kathmandu, Nepal", 27.7172, 85.3240),
    ("Beijing, China", 39.9042, 116.4074), ("Shanghai, China", 31.2304, 121.4737),
    ("Seoul, South Korea", 37.5665, 126.9780), ("Sydney, Australia", -33.8688, 151.2093),
    ("Auckland, New Zealand", -36.8485, 174.7633), ("Dubai, UAE", 25.2048, 55.2708),
    ("Tehran, Iran", 35.6892, 51.3890), ("Istanbul, Turkey", 41.0082, 28.9784),
    ("Cairo, Egypt", 30.0444, 31.2357), ("Lagos, Nigeria", 6.5244, 3.3792),
    ("Nairobi, Kenya", -1.2921, 36.8219), ("Addis Ababa, Ethiopia", 9.0320, 38.7469),
    ("Khartoum, Sudan", 15.5007, 32.5599), ("Johannesburg, South Africa", -26.2041, 28.0473),
    ("Kinshasa, DR Congo", -4.4419, 15.2663), ("Paris, France", 48.8566, 2.3522),
    ("Berlin, Germany", 52.5200, 13.4050), ("Madrid, Spain", 40.4168, -3.7038),
    ("Rome, Italy", 41.9028, 12.4964), ("Kyiv, Ukraine", 50.4501, 30.5234),
    ("Moscow, Russia", 55.7558, 37.6173), ("New York, USA", 40.7128, -74.0060),
    ("Los Angeles, USA", 34.0522, -118.2437), ("Mexico City, Mexico", 19.4326, -99.1332),
    ("Sao Paulo, Brazil", -23.5505, -46.6333), ("Lima, Peru", -12.0464, -77.0428),
]
MONITORED_CITIES = [{"name": n, "lat": la, "lon": lo} for n, la, lo in _CITY_COORDS]

# The original design called for a 10-year climatological baseline. A
# rolling 90-day window is used here instead as a deliberate, documented
# scope reduction: a 10-year archive pull per city is a heavier one-time
# cost better suited to a dedicated setup script than a recurring worker,
# and 90 days still captures genuine recent-season variability rather
# than an arbitrary fixed threshold. Worth stating exactly this way in
# the dissertation's limitations section rather than overselling it as
# the full climatological model.
BASELINE_WINDOW_DAYS = 90

# In-memory cache: city name -> {"temp_mean", "temp_std", "rain_mean", "rain_std"}.
# Refreshed daily by refresh_climate_baselines() rather than on every
# poll, since the baseline itself changes slowly and re-fetching 90 days of
# history every 5 minutes would be wasteful and needlessly hammer the API.
_BASELINE_CACHE: dict[str, dict] = {}

Z_THRESHOLD_ORANGE = 2.0  # ~2 standard deviations from the local norm
Z_THRESHOLD_RED = 3.0


@with_retry
async def _fetch_current(client: httpx.AsyncClient, city: dict) -> dict:
    response = await client.get(
        settings.open_meteo_base_url,
        params={
            "latitude": city["lat"],
            "longitude": city["lon"],
            "current": "temperature_2m,rain",
            "timezone": "auto",
        },
    )
    response.raise_for_status()
    return response.json()


@with_retry
async def _fetch_baseline(client: httpx.AsyncClient, city: dict) -> dict:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=BASELINE_WINDOW_DAYS)
    response = await client.get(
        "https://archive-api.open-meteo.com/v1/archive",
        params={
            "latitude": city["lat"],
            "longitude": city["lon"],
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": "temperature_2m_max,precipitation_sum",
            "timezone": "auto",
        },
    )
    response.raise_for_status()
    daily = response.json().get("daily", {})

    temps = [t for t in daily.get("temperature_2m_max", []) if t is not None]
    rains = [r for r in daily.get("precipitation_sum", []) if r is not None]

    return {
        "temp_mean": statistics.mean(temps) if temps else 20.0,
        "temp_std": statistics.pstdev(temps) if len(temps) > 1 else 5.0,
        "rain_mean": statistics.mean(rains) if rains else 2.0,
        "rain_std": statistics.pstdev(rains) if len(rains) > 1 else 5.0,
    }


async def refresh_climate_baselines() -> int:
    """Recomputes each monitored city's statistical baseline from the last
    90 days of history. Runs once at startup and then daily - see
    scheduler.py - decoupled from the fast 5-minute current-weather poll.
    """
    logger.info("[Open-Meteo] refreshing climate baselines")
    count = 0
    async with get_client() as client:
        for city in MONITORED_CITIES:
            try:
                _BASELINE_CACHE[city["name"]] = await _fetch_baseline(client, city)
                count += 1
            except Exception:
                logger.exception("[Open-Meteo] baseline fetch failed for %s", city["name"])
    logger.info("[Open-Meteo] baselines refreshed for %d/%d cities", count, len(MONITORED_CITIES))
    return count


def _build_event(city: dict, current: dict, baseline: dict) -> HazardEvent | None:
    temp = current.get("temperature_2m", 15.0)
    rain = current.get("rain", 0.0)

    temp_z = (temp - baseline["temp_mean"]) / baseline["temp_std"] if baseline["temp_std"] else 0.0
    # Rain is one-sided: unusually LOW rain isn't a hazard, unusually HIGH is.
    rain_z = (rain - baseline["rain_mean"]) / baseline["rain_std"] if baseline["rain_std"] else 0.0

    max_z = max(abs(temp_z), rain_z)
    if max_z < Z_THRESHOLD_ORANGE:
        return None

    alert_lvl = "Red" if max_z >= Z_THRESHOLD_RED else "Orange"
    hazard_type = "heavy_rain" if rain_z >= abs(temp_z) else "extreme_temp"
    event_id = f"weather_{city['name'].split(',')[0].lower().replace(' ', '_')}"

    return HazardEvent(
        id=event_id,
        hazard_type=hazard_type,
        location_name=(
            f"Atmospheric anomaly in {city['name']} "
            f"({max_z:.1f} standard deviations from the 90-day local norm)"
        ),
        latitude=city["lat"],
        longitude=city["lon"],
        severity_score=round(max_z, 2),  # expressed in std-devs, comparable across cities unlike raw temp/mm
        alert_level=alert_lvl,
        timestamp=datetime.now(timezone.utc),
        alert_triggered=True,
        source="open-meteo",
        estimated_impact=estimate_impact(alert_lvl),
    )


async def fetch_weather_anomalies() -> int:
    """Polls current conditions and flags statistical anomalies relative to
    each city's own 90-day baseline, rather than one-size-fits-all fixed
    thresholds. A 35C reading is unremarkable in Kuala Lumpur but a
    genuine anomaly in London - the Z-score approach accounts for that
    automatically, which a fixed threshold cannot.
    """
    logger.info("[Open-Meteo] checking monitored-city weather")

    async with get_client() as client:
        # Make sure every city has a baseline before scoring anomalies -
        # covers the first run before the daily refresh job has ever executed.
        missing = [c for c in MONITORED_CITIES if c["name"] not in _BASELINE_CACHE]
        for city in missing:
            try:
                _BASELINE_CACHE[city["name"]] = await _fetch_baseline(client, city)
            except Exception:
                logger.exception("[Open-Meteo] baseline fetch failed for %s", city["name"])

        results = await asyncio.gather(
            *(_fetch_current(client, city) for city in MONITORED_CITIES),
            return_exceptions=True,
        )

    events: list[HazardEvent] = []
    for city, result in zip(MONITORED_CITIES, results):
        if isinstance(result, Exception):
            logger.error("[Open-Meteo] fetch failed for %s: %s", city["name"], result)
            continue
        baseline = _BASELINE_CACHE.get(city["name"])
        if baseline is None:
            continue
        event = _build_event(city, result.get("current", {}), baseline)
        if event is not None:
            events.append(event)

    async with database.SessionLocal() as session:
        count = await upsert_many(session, events)

    logger.info("[Open-Meteo] synced %d anomalies (of %d cities checked)", count, len(MONITORED_CITIES))
    return count

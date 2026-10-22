from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .alerts import dispatch_alerts
from .config import settings
from .knowledge.sync import sync_knowledge_layer
from .workers.acled import fetch_acled_events
from .workers.gdacs import fetch_gdacs_alerts
from .workers.gdelt import fetch_gdelt_unrest_events
from .workers.gnews import fetch_gnews_events
from .workers.usgs import fetch_global_earthquakes
from .workers.weather import fetch_weather_anomalies, refresh_climate_baselines

# AsyncIOScheduler (not BackgroundScheduler) so jobs run as native
# coroutines on the same event loop as FastAPI, instead of the prototype's
# BackgroundScheduler spinning up its own OS thread per job and calling
# blocking `requests` from inside it.
scheduler = AsyncIOScheduler()


def configure_scheduler() -> None:
    scheduler.add_job(
        fetch_global_earthquakes, "interval",
        minutes=settings.poll_interval_minutes_fast, id="usgs", replace_existing=True,
    )
    scheduler.add_job(
        fetch_gdacs_alerts, "interval",
        minutes=settings.poll_interval_minutes_fast, id="gdacs", replace_existing=True,
    )
    scheduler.add_job(
        fetch_weather_anomalies, "interval",
        minutes=settings.poll_interval_minutes_slow, id="weather", replace_existing=True,
    )
    scheduler.add_job(
        fetch_gdelt_unrest_events, "interval",
        minutes=settings.poll_interval_minutes_slow, id="gdelt", replace_existing=True,
    )
    scheduler.add_job(
        fetch_gnews_events, "interval",
        minutes=settings.poll_interval_minutes_slow, id="gnews", replace_existing=True,
    )
    scheduler.add_job(
        fetch_acled_events, "interval",
        minutes=settings.poll_interval_minutes_slow, id="acled", replace_existing=True,
    )
    scheduler.add_job(
        sync_knowledge_layer, "interval",
        minutes=settings.knowledge_sync_interval_minutes, id="knowledge_sync", replace_existing=True,
    )
    scheduler.add_job(
        dispatch_alerts, "interval",
        minutes=settings.poll_interval_minutes_fast, id="alert_dispatch", replace_existing=True,
    )
    scheduler.add_job(
        refresh_climate_baselines, "interval",
        hours=24, id="climate_baseline_refresh", replace_existing=True,
    )

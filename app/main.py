import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import BackgroundTasks, FastAPI, HTTPException, Response

from . import database
from .alerts import (
    AlertDeliveryError,
    build_alert_feed,
    email_configured,
    email_recipients,
    send_test,
    telegram_configured,
)
from .analytics import top_regions, trends_by_day
from .export import render_docx, render_pdf
from .links import resolve_url
from .reports import REPORT_TYPES, brief_query_for, build_report, in_scope
from .priority import rank_hazards
from .config import settings
from .intelligence.prompts import DEFAULT_ROLE
from .intelligence.rag import generate_brief
from .knowledge.neo4j_client import close_neo4j_driver
from .knowledge.query import graph_stats as knowledge_graph_stats_query
from .knowledge.query import hybrid_search, search_hazards
from .knowledge.sync import sync_knowledge_layer
from .repository import (
    apply_review_decision,
    apply_severity_override,
    count_by_type,
    create_incident_note,
    create_report,
    get_report,
    list_audit_log,
    hazard_exists,
    latest_update,
    list_alert_sends,
    list_hazards,
    list_hazards_since,
    list_incident_notes,
    list_links,
    list_reports,
    list_reviews,
)
from .schemas import (
    AlertTestIn,
    AuditEntryOut,
    ExportIn,
    HazardEvent,
    IncidentNoteCreate,
    IncidentNoteOut,
    IncidentReviewOut,
    ReportCreate,
    ReportOut,
    ReviewDecisionIn,
    SeverityOverrideIn,
)
from .scheduler import configure_scheduler, scheduler
from .workers.acled import fetch_acled_events
from .workers.gdacs import fetch_gdacs_alerts
from .workers.gdelt import fetch_gdelt_unrest_events
from .workers.gnews import fetch_gnews_events
from .workers.usgs import fetch_global_earthquakes
from .workers.weather import fetch_weather_anomalies, refresh_climate_baselines

logging.basicConfig(level=settings.log_level, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


_background_tasks: set[asyncio.Task] = set()


async def _bootstrap() -> None:
    """First fetch of every source plus a knowledge sync. Runs in the
    background so the API starts answering at once (a slow or down feed used
    to delay startup, which makes hosting platforms think the app is dead).
    Each step is isolated: one failing source must not stop the others."""
    steps = (
        fetch_global_earthquakes,
        fetch_gdacs_alerts,
        refresh_climate_baselines,
        fetch_weather_anomalies,
        fetch_gdelt_unrest_events,
        fetch_gnews_events,  # no-ops gracefully without GNEWS_API_KEY
        fetch_acled_events,  # no-ops gracefully without ACLED credentials
        sync_knowledge_layer,  # Chroma/Neo4j may still be booting; the schedule retries
    )
    for step in steps:
        try:
            await step()
        except Exception:
            logger.exception("[Bootstrap] %s failed, continuing", step.__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Replaces the deprecated @app.on_event("startup"/"shutdown") pair.
    await database.init_db()
    configure_scheduler()
    scheduler.start()

    # Keep a reference: asyncio only holds weak references to tasks, so an
    # unreferenced one can be garbage-collected mid-run.
    task = asyncio.create_task(_bootstrap())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    logger.info("CISE ingestion orchestrator started")
    yield
    scheduler.shutdown()
    await close_neo4j_driver()
    logger.info("Scheduler shut down cleanly")


app = FastAPI(
    title="Crisis Intelligence Synthesis Engine (CISE)",
    description="Multi-Source Global Hazard & Unrest Ingestion Network (USGS, GDACS, Open-Meteo, GDELT, ACLED)",
    lifespan=lifespan,
)


@app.get("/", tags=["System"])
async def status():
    async with database.SessionLocal() as session:
        counts = await count_by_type(session)
        last = await latest_update(session)
    return {
        "status": "online",
        "active_hazard_count": sum(counts.values()),
        "by_type": counts,
        # When any feed last wrote data - the dashboard shows this instead of
        # a manual "refresh" button, since ingestion runs on a schedule.
        "last_data_update": last.isoformat() if last else None,
    }


@app.get("/api/hazards", response_model=list[HazardEvent], tags=["Data Feeds"])
async def get_hazards(
    hazard_type: str | None = None,
    alert_level: str | None = None,
    limit: int = 500,
    days: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
):
    """Optional date window: `days` = last N days, or an explicit
    `since` (inclusive) / `until` (exclusive) range, which wins over `days`.
    This is what the dashboard's date-range picker sends."""
    async with database.SessionLocal() as session:
        hazards = await list_hazards(
            session, hazard_type=hazard_type, alert_level=alert_level, limit=limit,
            days=days, since=since, until=until,
        )
        links = await list_links(session)
    for h in hazards:
        # Plain attribute on the ORM object; the response model reads it.
        h.url = resolve_url(h.source, h.id, links.get(h.id))
    return hazards


@app.post("/api/hazards/force-sync", tags=["Manual Testing"])
async def force_sync(background_tasks: BackgroundTasks):
    background_tasks.add_task(fetch_global_earthquakes)
    background_tasks.add_task(fetch_gdacs_alerts)
    background_tasks.add_task(fetch_weather_anomalies)
    background_tasks.add_task(fetch_gdelt_unrest_events)
    background_tasks.add_task(fetch_gnews_events)
    background_tasks.add_task(fetch_acled_events)
    return {"status": "Manual sync queued for all sources."}


@app.get("/api/stats", tags=["Data Feeds"])
async def stats():
    async with database.SessionLocal() as session:
        return await count_by_type(session)


@app.get("/api/analytics/trends", tags=["Analytics"])
async def analytics_trends(days: int = 30, since: datetime | None = None, until: datetime | None = None):
    """Daily hazard counts by type, for a trend-over-time chart."""
    async with database.SessionLocal() as session:
        hazards = await list_hazards_since(session, days=days, since=since, until=until)
    return trends_by_day(hazards)


@app.get("/api/analytics/top-regions", tags=["Analytics"])
async def analytics_top_regions(
    days: int = 30, limit: int = 10, since: datetime | None = None, until: datetime | None = None
):
    """Most-affected regions by hazard count. Region is extracted
    heuristically from location_name (see app/analytics.py) since no
    source provides a clean, separate region/country field.
    """
    async with database.SessionLocal() as session:
        hazards = await list_hazards_since(session, days=days, since=since, until=until)
    return top_regions(hazards, limit=limit)


@app.get("/api/hazards/prioritized", tags=["Data Feeds"])
async def prioritized_hazards(
    limit: int = 5, days: int | None = None, since: datetime | None = None, until: datetime | None = None
):
    """Top hazards ranked by priority_score (0-100) and labeled
    Critical/High/Moderate/Low - see app/priority.py for the scoring
    design (alert_level sets the base tier, severity_score only breaks
    ties within a tier, never compared directly across sources).
    """
    async with database.SessionLocal() as session:
        hazards = await list_hazards(session, limit=1000, days=days, since=since, until=until)
        reviews = await list_reviews(session)
        links = await list_links(session)
    ranked = rank_hazards(hazards, limit=limit, reviews=reviews)
    source_by_id = {h.id: h.source for h in hazards}
    for item in ranked:
        item["url"] = resolve_url(source_by_id[item["id"]], item["id"], links.get(item["id"]))
    return ranked


@app.post("/api/incidents/{hazard_id}/review", response_model=IncidentReviewOut, tags=["Human-in-the-Loop"])
async def review_incident(hazard_id: str, body: ReviewDecisionIn):
    """An analyst confirms (validates) or dismisses (false positive) a
    hazard. Stored separately from the hazard itself so the 5-minute
    re-ingestion can't overwrite it; also written to the audit log.
    """
    async with database.SessionLocal() as session:
        review = await apply_review_decision(session, hazard_id, body.decision, body.actor)
    if review is None:
        raise HTTPException(status_code=404, detail=f"Unknown hazard id: {hazard_id}")
    return review


@app.post("/api/incidents/{hazard_id}/severity", response_model=IncidentReviewOut, tags=["Human-in-the-Loop"])
async def override_incident_severity(hazard_id: str, body: SeverityOverrideIn):
    """Manual severity override on the 0-100 priority scale. Replaces the
    computed priority_score for this hazard in /api/hazards/prioritized.
    """
    async with database.SessionLocal() as session:
        review = await apply_severity_override(session, hazard_id, body.severity, body.actor)
    if review is None:
        raise HTTPException(status_code=404, detail=f"Unknown hazard id: {hazard_id}")
    return review


@app.get("/api/audit-log", response_model=list[AuditEntryOut], tags=["Human-in-the-Loop"])
async def audit_log(limit: int = 60):
    """Newest-first trail of analyst decisions, for the Activity page."""
    async with database.SessionLocal() as session:
        return await list_audit_log(session, limit=limit)


# --- Alerts (Telegram + email) ----------------------------------------------


@app.get("/api/alerts/config", tags=["Alerts"])
async def alerts_config():
    """Which delivery channels are set up. Never returns the bot token, the
    SMTP password or the recipient addresses - only whether they exist."""
    return {
        "telegram_configured": telegram_configured(),
        "email_configured": email_configured(),
        "email_recipient_count": len(email_recipients()),
        "min_level": settings.alert_min_level,
    }


@app.get("/api/alerts", tags=["Alerts"])
async def alerts(min_level: str = "Orange", limit: int = 50):
    """Alert-level hazards (not dismissed), newest first, with the channels
    each one was pushed out through."""
    async with database.SessionLocal() as session:
        hazards = await list_hazards(session, limit=1000)
        reviews = await list_reviews(session)
        sent = await list_alert_sends(session)
        links = await list_links(session)
    return build_alert_feed(hazards, reviews, sent, links, min_level, limit=limit)


@app.post("/api/alerts/test", tags=["Alerts"])
async def alerts_test(body: AlertTestIn):
    """Sends a harmless test message on one channel so you can confirm it works."""
    configured = {"telegram": telegram_configured, "email": email_configured}[body.channel]()
    if not configured:
        hint = (
            "set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID"
            if body.channel == "telegram"
            else "set SMTP_HOST, SMTP_FROM (or SMTP_USER) and ALERT_EMAIL_TO"
        )
        raise HTTPException(status_code=400, detail=f"{body.channel.capitalize()} is not configured ({hint}).")
    try:
        await send_test(body.channel)
    except AlertDeliveryError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"status": "sent", "channel": body.channel}


# --- Reports + export --------------------------------------------------------


@app.post("/api/reports", response_model=ReportOut, tags=["Reports"])
async def generate_report(body: ReportCreate):
    """Builds a report from live data, adds the AI assessment when the LLM
    is reachable, stores it, and logs it. Slow when the LLM is used."""
    async with database.SessionLocal() as session:
        hazards = await list_hazards(session, limit=1000)
        reviews = await list_reviews(session)
        links = await list_links(session)

    ranked = rank_hazards(hazards, limit=1000, reviews=reviews)
    source_by_id = {h.id: h.source for h in hazards}
    for item in ranked:
        item["url"] = resolve_url(source_by_id[item["id"]], item["id"], links.get(item["id"]))

    brief = None
    if in_scope(ranked, body.scope):  # don't pay for an LLM call when there's nothing to brief
        _title, role, _top_n = REPORT_TYPES[body.report_type]
        try:
            brief = await generate_brief(
                brief_query_for(body.report_type, body.scope), n_results=settings.intelligence_top_k, role=role
            )
        except Exception:
            logger.exception("[Reports] AI brief failed, building a data-only report")

    title, content, ai_included = build_report(body.report_type, body.scope, ranked, brief, body.actor)
    async with database.SessionLocal() as session:
        return await create_report(
            session, title, body.report_type, (body.scope or "").strip() or None, content, ai_included, body.actor
        )


@app.get("/api/reports", response_model=list[ReportOut], tags=["Reports"])
async def reports_list(limit: int = 50):
    async with database.SessionLocal() as session:
        return await list_reports(session, limit=limit)


@app.get("/api/reports/{report_id}", response_model=ReportOut, tags=["Reports"])
async def report_detail(report_id: int):
    async with database.SessionLocal() as session:
        report = await get_report(session, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Unknown report id: {report_id}")
    return report


_EXPORT_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@app.post("/api/export/{fmt}", tags=["Reports"])
async def export_document(fmt: str, body: ExportIn):
    """Turns report/brief markdown into a downloadable PDF or DOCX."""
    if fmt not in _EXPORT_MEDIA_TYPES:
        raise HTTPException(status_code=404, detail="Format must be 'pdf' or 'docx'.")
    render = render_pdf if fmt == "pdf" else render_docx
    data = render(body.title, body.markdown)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in body.title)[:60] or "cise-report"
    return Response(
        content=data,
        media_type=_EXPORT_MEDIA_TYPES[fmt],
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.{fmt}"'},
    )


@app.post("/api/incidents/{hazard_id}/notes", response_model=IncidentNoteOut, tags=["Historical Repository"])
async def add_incident_note(hazard_id: str, note: IncidentNoteCreate):
    """The "impact records, response logs, and lessons learned" the report
    names as part of the historical repository, alongside raw hazard data.
    Deliberately human-entered rather than auto-generated - fabricating
    response/impact data would misrepresent what actually happened. When
    affected_infrastructure/responding_organisation are filled in, they get
    mirrored into Neo4j as real graph entities on the next knowledge sync.
    """
    async with database.SessionLocal() as session:
        if not await hazard_exists(session, hazard_id):
            raise HTTPException(status_code=404, detail=f"Unknown hazard id: {hazard_id}")
        return await create_incident_note(session, hazard_id, note)


@app.get("/api/incidents/{hazard_id}/notes", response_model=list[IncidentNoteOut], tags=["Historical Repository"])
async def get_incident_notes(hazard_id: str):
    async with database.SessionLocal() as session:
        return await list_incident_notes(session, hazard_id)


@app.post("/api/knowledge/sync", tags=["Knowledge Layer"])
async def knowledge_sync():
    """Manually trigger a sync of current Postgres hazard data (and
    incident notes) into Chroma and Neo4j. Also runs automatically on a
    schedule (see scheduler.py).
    """
    return await sync_knowledge_layer()


@app.get("/api/knowledge/search", tags=["Knowledge Layer"])
async def knowledge_search(q: str, n_results: int = 5, since: datetime | None = None, until: datetime | None = None):
    """Pure semantic search via Chroma only - useful for isolating whether
    a retrieval issue is coming from the vector search specifically.
    since/until (ISO 8601) optionally restrict results to a time range.
    """
    return await search_hazards(q, n_results=n_results, since=since, until=until)


@app.get("/api/knowledge/hybrid-search", tags=["Knowledge Layer"])
async def knowledge_hybrid_search(
    q: str, n_results: int = 5, since: datetime | None = None, until: datetime | None = None
):
    """Combined Chroma semantic + Neo4j graph search - this is what the
    RAG pipeline actually uses internally for /api/intelligence/brief.
    """
    return await hybrid_search(q, n_results=n_results, since=since, until=until)


@app.get("/api/knowledge/graph-stats", tags=["Knowledge Layer"])
async def knowledge_graph_stats():
    """Node counts per label in the Neo4j graph, for a quick sanity check."""
    return await knowledge_graph_stats_query()


@app.get("/api/intelligence/brief", tags=["Intelligence Layer"])
async def intelligence_brief(query: str, n_results: int = 5, role: str = DEFAULT_ROLE):
    """RAG endpoint: hybrid-retrieves relevant hazards (Chroma semantic +
    Neo4j graph search), asks the local LLM for a structured JSON briefing
    framed for `role` (operator/executive/analyst), and returns it
    alongside three guardrail checks (grounding_score, numbers_grounded,
    domain_constraints_ok), the alert_triggered decision, and raw sources.
    """
    return await generate_brief(query, n_results=n_results, role=role)

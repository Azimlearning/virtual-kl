from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    AlertSend,
    AuditLogEntry,
    HazardContext,
    HazardLink,
    HazardRecord,
    IncidentNote,
    IncidentReview,
    Report,
)
from .schemas import HazardEvent, IncidentNoteCreate


async def _save_extras(session: AsyncSession, event: HazardEvent) -> None:
    """Store/refresh the optional extras that live in their own tables: the
    original-source URL and the short context text. Each is skipped when the
    feed gave none, so a later poll without it never erases what we have.

    The explicit flush matters on Postgres: these tables' hazard_id columns
    are foreign keys to hazards.id, and Postgres rejects a row whose hazard
    isn't in the database yet (SQLite doesn't check, so tests wouldn't
    notice). Flushing first guarantees the hazard row is written first."""
    if not event.url and not event.context:
        return
    await session.flush()
    if event.url:
        link = await session.get(HazardLink, event.id)
        if link is None:
            session.add(HazardLink(hazard_id=event.id, url=event.url))
        else:
            link.url = event.url
    if event.context:
        ctx = await session.get(HazardContext, event.id)
        if ctx is None:
            session.add(HazardContext(hazard_id=event.id, text=event.context))
        else:
            ctx.text = event.context


async def upsert_hazard(session: AsyncSession, event: HazardEvent) -> None:
    """Insert a new hazard row, or update it in place if the id already
    exists. This replaces `ACTIVE_HAZARDS[id_] = HazardEvent(...)` from the
    prototype: same "latest write wins per id" semantics, but persisted.

    Uses session.get() + attribute updates (portable ORM-level upsert)
    rather than a Postgres-specific `INSERT ... ON CONFLICT`, so the exact
    same code path is tested against SQLite in-memory and runs against
    Postgres in production.
    """
    existing = await session.get(HazardRecord, event.id)
    now = datetime.now(timezone.utc)

    if existing is None:
        session.add(
            HazardRecord(
                id=event.id,
                hazard_type=event.hazard_type,
                location_name=event.location_name,
                latitude=event.latitude,
                longitude=event.longitude,
                severity_score=event.severity_score,
                alert_level=event.alert_level,
                timestamp=event.timestamp,
                alert_triggered=event.alert_triggered,
                source=event.source,
                estimated_impact=event.estimated_impact,
                sentiment_score=event.sentiment_score,
                first_seen_at=now,
                last_updated_at=now,
            )
        )
        await _save_extras(session, event)
        return

    existing.hazard_type = event.hazard_type
    existing.location_name = event.location_name
    existing.latitude = event.latitude
    existing.longitude = event.longitude
    existing.severity_score = event.severity_score
    existing.alert_level = event.alert_level
    existing.timestamp = event.timestamp
    existing.alert_triggered = event.alert_triggered
    existing.source = event.source
    existing.estimated_impact = event.estimated_impact
    existing.sentiment_score = event.sentiment_score
    existing.last_updated_at = now
    await _save_extras(session, event)


async def upsert_many(session: AsyncSession, events: list[HazardEvent]) -> int:
    for event in events:
        await upsert_hazard(session, event)
    await session.commit()
    return len(events)


def _window(days: int | None, since: datetime | None, until: datetime | None):
    """Normalises the three ways of asking for a time window into (since, until)."""
    if since is not None or until is not None:
        # Naive datetimes (no timezone) are treated as UTC.
        if since is not None and since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)
        if until is not None and until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        return since, until
    if days:
        return datetime.now(timezone.utc) - timedelta(days=days), None
    return None, None


async def list_hazards(
    session: AsyncSession,
    hazard_type: str | None = None,
    alert_level: str | None = None,
    limit: int = 500,
    days: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> list[HazardRecord]:
    """`days` = last N days. `since`/`until` = an explicit window (the date
    range picker): since is inclusive, until is EXCLUSIVE, so "1-7 Oct" is
    sent as since=1 Oct 00:00, until=8 Oct 00:00. An explicit window wins
    over `days` if both are given."""
    stmt = select(HazardRecord).order_by(HazardRecord.timestamp.desc()).limit(limit)
    since, until = _window(days, since, until)
    if since:
        stmt = stmt.where(HazardRecord.timestamp >= since)
    if until:
        stmt = stmt.where(HazardRecord.timestamp < until)
    if hazard_type:
        stmt = stmt.where(HazardRecord.hazard_type == hazard_type)
    if alert_level:
        stmt = stmt.where(HazardRecord.alert_level == alert_level)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def count_by_type(session: AsyncSession) -> dict[str, int]:
    stmt = select(HazardRecord.hazard_type, func.count()).group_by(HazardRecord.hazard_type)
    result = await session.execute(stmt)
    return {hazard_type: count for hazard_type, count in result.all()}


async def create_incident_note(session: AsyncSession, hazard_id: str, note: IncidentNoteCreate) -> IncidentNote:
    record = IncidentNote(
        hazard_id=hazard_id,
        note_type=note.note_type,
        content=note.content,
        affected_infrastructure=note.affected_infrastructure,
        responding_organisation=note.responding_organisation,
        created_by=note.created_by,
    )
    session.add(record)
    # Same transaction as the note: who wrote what, when, on the audit trail.
    session.add(
        AuditLogEntry(
            actor_name=note.created_by,
            action="note_added",
            entity_type="hazard",
            entity_id=hazard_id,
            details={"note_type": note.note_type},
        )
    )
    await session.commit()
    await session.refresh(record)
    return record


async def hazard_exists(session: AsyncSession, hazard_id: str) -> bool:
    return await session.get(HazardRecord, hazard_id) is not None


async def latest_update(session: AsyncSession) -> datetime | None:
    """When any hazard row was last written by a worker - i.e. when fresh
    data last arrived. Shown on the dashboard as the "last updated" time."""
    result = await session.execute(select(func.max(HazardRecord.last_updated_at)))
    return result.scalar_one_or_none()


async def list_incident_notes(session: AsyncSession, hazard_id: str) -> list[IncidentNote]:
    stmt = select(IncidentNote).where(IncidentNote.hazard_id == hazard_id).order_by(IncidentNote.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_all_incident_notes(session: AsyncSession, limit: int = 500) -> list[IncidentNote]:
    """Used by the knowledge-sync job to mirror notes into Neo4j."""
    stmt = select(IncidentNote).order_by(IncidentNote.created_at.desc()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_hazards_since(
    session: AsyncSession,
    days: int = 30,
    limit: int = 5000,
    since: datetime | None = None,
    until: datetime | None = None,
) -> list[HazardRecord]:
    """Feeds the analytics aggregation functions (app/analytics.py).
    Aggregation happens in Python there, not SQL, so this just needs to
    return the raw rows in the window (last `days`, or an explicit
    since/until window - see list_hazards).
    """
    return await list_hazards(session, limit=limit, days=days, since=since, until=until)


# --- Human-in-the-loop: reviews + audit log --------------------------------


async def list_reviews(session: AsyncSession) -> dict[str, IncidentReview]:
    """All review decisions keyed by hazard id, so callers (the priority
    ranking) can look each hazard up in O(1) instead of querying per row."""
    result = await session.execute(select(IncidentReview))
    return {r.hazard_id: r for r in result.scalars().all()}


async def _get_or_create_review(session: AsyncSession, hazard_id: str) -> IncidentReview:
    review = await session.get(IncidentReview, hazard_id)
    if review is None:
        review = IncidentReview(hazard_id=hazard_id, status="active", validated=False)
        session.add(review)
    return review


async def apply_review_decision(
    session: AsyncSession, hazard_id: str, decision: str, actor: str
) -> IncidentReview | None:
    """Confirm or dismiss a hazard. Returns None if the hazard doesn't exist.

    confirm -> validated=True, status="active" (also reopens a previously
               dismissed incident, so a mistaken dismissal is reversible).
    dismiss -> validated=False, status="dismissed".

    The review update and its audit entry are committed in ONE transaction,
    so you can never have a decision without a log line, or vice versa.
    """
    if await session.get(HazardRecord, hazard_id) is None:
        return None

    review = await _get_or_create_review(session, hazard_id)
    if decision == "confirm":
        review.validated = True
        review.status = "active"
        action = "incident_confirmed"
    else:
        review.validated = False
        review.status = "dismissed"
        action = "incident_dismissed"
    review.reviewed_by = actor
    review.reviewed_at = datetime.now(timezone.utc)

    session.add(AuditLogEntry(actor_name=actor, action=action, entity_type="hazard", entity_id=hazard_id))
    await session.commit()
    await session.refresh(review)
    return review


async def apply_severity_override(
    session: AsyncSession, hazard_id: str, severity: float, actor: str
) -> IncidentReview | None:
    """Set an analyst's priority score for a hazard. Returns None if the
    hazard doesn't exist. The previous override (if any) is recorded in the
    audit entry so a change of mind is traceable."""
    if await session.get(HazardRecord, hazard_id) is None:
        return None

    review = await _get_or_create_review(session, hazard_id)
    previous = review.severity_override
    review.severity_override = severity
    review.reviewed_by = actor
    review.reviewed_at = datetime.now(timezone.utc)

    session.add(
        AuditLogEntry(
            actor_name=actor,
            action="severity_override",
            entity_type="hazard",
            entity_id=hazard_id,
            details={"severity": severity, "previous": previous},
        )
    )
    await session.commit()
    await session.refresh(review)
    return review


async def list_audit_log(session: AsyncSession, limit: int = 60) -> list[AuditLogEntry]:
    stmt = select(AuditLogEntry).order_by(AuditLogEntry.created_at.desc(), AuditLogEntry.id.desc()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


# --- Source links ------------------------------------------------------------


async def list_links(session: AsyncSession) -> dict[str, str]:
    """hazard id -> stored original-source URL."""
    result = await session.execute(select(HazardLink))
    return {link.hazard_id: link.url for link in result.scalars().all()}


# --- Alerts ------------------------------------------------------------------


async def list_alert_sends(session: AsyncSession) -> dict[tuple[str, str], datetime]:
    """(hazard id, channel) -> when it was sent."""
    result = await session.execute(select(AlertSend))
    return {(s.hazard_id, s.channel): s.sent_at for s in result.scalars().all()}


async def record_alert_send(session: AsyncSession, hazard_id: str, channel: str) -> None:
    if await session.get(AlertSend, (hazard_id, channel)) is None:
        session.add(AlertSend(hazard_id=hazard_id, channel=channel))
        await session.commit()


async def list_contexts(session: AsyncSession) -> dict[str, str]:
    """hazard id -> context text (news summaries etc.)."""
    result = await session.execute(select(HazardContext))
    return {c.hazard_id: c.text for c in result.scalars().all()}


# --- Reports -----------------------------------------------------------------


async def create_report(
    session: AsyncSession,
    title: str,
    report_type: str,
    scope: str | None,
    content: str,
    ai_included: bool,
    generated_by: str,
) -> Report:
    """Saves the report and its audit entry in one transaction."""
    report = Report(
        title=title,
        report_type=report_type,
        scope=scope,
        content=content,
        ai_included=ai_included,
        generated_by=generated_by,
    )
    session.add(report)
    await session.flush()  # assigns report.id so the audit entry can reference it
    session.add(
        AuditLogEntry(
            actor_name=generated_by,
            action="report_generated",
            entity_type="report",
            entity_id=str(report.id),
            details={"report_type": report_type, "scope": scope, "ai_included": ai_included},
        )
    )
    await session.commit()
    await session.refresh(report)
    return report


async def list_reports(session: AsyncSession, limit: int = 50) -> list[Report]:
    stmt = select(Report).order_by(Report.created_at.desc(), Report.id.desc()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_report(session: AsyncSession, report_id: int) -> Report | None:
    return await session.get(Report, report_id)

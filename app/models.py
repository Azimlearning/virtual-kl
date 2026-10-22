from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class HazardRecord(Base):
    """Persistent counterpart of the old in-memory ACTIVE_HAZARDS dict.

    Row identity is the hazard's natural id (USGS feature id, GDACS guid,
    a derived weather-station key, or a hashed GDELT article key) so that
    repeated polls update the same row instead of duplicating it.
    """

    __tablename__ = "hazards"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    hazard_type: Mapped[str] = mapped_column(String, index=True)
    location_name: Mapped[str] = mapped_column(String)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    severity_score: Mapped[float] = mapped_column(Float)
    alert_level: Mapped[str] = mapped_column(String, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    alert_triggered: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String, index=True)
    estimated_impact: Mapped[str] = mapped_column(String, default="Low")
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class IncidentNote(Base):
    """The "impact records, response logs, and lessons learned" the report's
    Layer 2 description names alongside the raw hazard repository. These
    are human-entered (via the API for now; a dashboard UI for this is
    future work) rather than auto-generated - deliberately, since
    fabricating response/impact data would be dishonest. `affected_infrastructure`
    and `responding_organisation` are free-text fields that, when present,
    get mirrored into Neo4j as real graph entities (see knowledge/sync.py) -
    this is how the graph gets genuine Infrastructure/Organisation nodes
    grounded in real entered data, rather than fabricated ones.
    """

    __tablename__ = "incident_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hazard_id: Mapped[str] = mapped_column(String, ForeignKey("hazards.id"), index=True)
    note_type: Mapped[str] = mapped_column(String)  # "response_log" | "lesson_learned" | "impact_record"
    content: Mapped[str] = mapped_column(String)
    affected_infrastructure: Mapped[str | None] = mapped_column(String, nullable=True)
    responding_organisation: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[str] = mapped_column(String, default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class IncidentReview(Base):
    """The human-in-the-loop decision for one hazard: confirmed, dismissed,
    and/or a manual severity override.

    Why this is its own table instead of extra columns on `hazards`: the
    ingestion workers re-write every hazard row on each poll (see
    repository.upsert_hazard), so any human decision stored on that row
    would be silently overwritten within minutes. Keeping reviews separate
    means a decision survives re-ingestion. It also means no migration is
    needed - `create_all` creates this brand-new table on next startup,
    whereas it would never add columns to the already-existing `hazards`
    table.

    One row per hazard (hazard_id is the primary key); changing your mind
    updates the row. The full history of changes lives in AuditLogEntry.

    status:  "active" (default, still needs attention) or "dismissed"
             (analyst judged it a false positive).
    validated: True once an analyst has confirmed the incident.
    severity_override: an analyst-set priority score (0-100). When set, it
             replaces the computed priority_score for this hazard.
    """

    __tablename__ = "incident_reviews"

    hazard_id: Mapped[str] = mapped_column(String, ForeignKey("hazards.id"), primary_key=True)
    status: Mapped[str] = mapped_column(String, default="active")
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    severity_override: Mapped[float | None] = mapped_column(Float, nullable=True)
    reviewed_by: Mapped[str] = mapped_column(String, default="unknown")
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class AuditLogEntry(Base):
    """Append-only record of every analyst decision - 'who did what, when'.
    Rows are only ever added, never edited or deleted, which is what makes
    it an audit trail you can show an examiner. `details` is a small JSON
    blob whose shape depends on the action (e.g. the new severity value).
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_name: Mapped[str] = mapped_column(String, default="unknown")
    action: Mapped[str] = mapped_column(String, index=True)
    entity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class HazardLink(Base):
    """Original-source URL for a hazard. Separate table (not a column on
    `hazards`) for the same reason as IncidentReview: create_all never adds
    columns to an existing table, so a new table needs no migration."""

    __tablename__ = "hazard_links"

    hazard_id: Mapped[str] = mapped_column(String, ForeignKey("hazards.id"), primary_key=True)
    url: Mapped[str] = mapped_column(String)


class AlertSend(Base):
    """One row per (hazard, channel) that has been pushed out as a
    notification, so the scheduler never sends the same alert twice on the
    same channel - while still letting a hazard go out once by Telegram AND
    once by email. (Replaces the first-version `alert_deliveries` table,
    whose primary key was the hazard alone and so couldn't tell channels
    apart. create_all can't alter an existing table, hence a new table name;
    the old one is simply left unused.)"""

    __tablename__ = "alert_sends"

    hazard_id: Mapped[str] = mapped_column(String, ForeignKey("hazards.id"), primary_key=True)
    channel: Mapped[str] = mapped_column(String, primary_key=True)  # "telegram" | "email"
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class HazardContext(Base):
    """A short human-readable description for a hazard (e.g. a news article's
    summary). It is added to the sentence Chroma embeds, which is what gives
    the AI real context to write from instead of just "type, place, level".
    Separate table for the same no-migration reason as HazardLink."""

    __tablename__ = "hazard_context"

    hazard_id: Mapped[str] = mapped_column(String, ForeignKey("hazards.id"), primary_key=True)
    text: Mapped[str] = mapped_column(String)


class Report(Base):
    """A generated situation report, stored as markdown so the same text can
    be shown on screen and exported to PDF/DOCX."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String)
    report_type: Mapped[str] = mapped_column(String)  # situation | executive | regional
    scope: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str] = mapped_column(String)
    ai_included: Mapped[bool] = mapped_column(Boolean, default=False)
    generated_by: Mapped[str] = mapped_column(String, default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

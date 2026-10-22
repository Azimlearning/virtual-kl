from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class HazardEvent(BaseModel):
    """Unified hazard schema (mirrors the original prototype's HazardEvent,
    plus `source` for provenance, `estimated_impact` (Layer 2 requirement -
    see app/impact.py for the honest scope note), and `sentiment_score`
    (currently only populated by the GDELT worker; None for all other
    sources).
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    hazard_type: str
    location_name: str
    latitude: float
    longitude: float
    severity_score: float
    alert_level: str
    timestamp: datetime
    alert_triggered: bool
    source: str
    estimated_impact: str = "Low"
    sentiment_score: float | None = None
    # Link to the original source page. Workers set it when the feed
    # provides one (USGS, GDACS, GDELT); /api/hazards fills in a sensible
    # fallback (see app/links.py) so the UI always has something to open.
    url: str | None = None
    # Short description from the source (e.g. a news article's summary).
    # Stored separately and fed to the AI as extra context; never shown as fact.
    context: str | None = None


# Notes are typed by people into a form, so bound them: stripped of stray
# whitespace, never empty, and capped so nobody can store a novel.
_NoteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
_ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class IncidentNoteCreate(BaseModel):
    note_type: Literal["response_log", "lesson_learned", "impact_record"]
    content: _NoteText
    affected_infrastructure: _ShortText | None = None
    responding_organisation: _ShortText | None = None
    created_by: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = "unknown"


class IncidentNoteOut(IncidentNoteCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hazard_id: str
    created_at: datetime


class ReviewDecisionIn(BaseModel):
    decision: Literal["confirm", "dismiss"]
    actor: str = "unknown"


class SeverityOverrideIn(BaseModel):
    # 0-100 matches the priority_score scale used by app/priority.py, so an
    # override is directly comparable with computed scores. Pydantic rejects
    # anything outside the range with a 422 before our code even runs.
    severity: float = Field(ge=0, le=100)
    actor: str = "unknown"


class IncidentReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hazard_id: str
    status: str
    validated: bool
    severity_override: float | None = None
    reviewed_by: str
    reviewed_at: datetime


class ReportCreate(BaseModel):
    report_type: Literal["situation", "executive", "regional"]
    scope: str | None = Field(default=None, max_length=100)
    actor: str = "unknown"


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    report_type: str
    scope: str | None = None
    content: str
    ai_included: bool
    generated_by: str
    created_at: datetime


class AlertTestIn(BaseModel):
    channel: Literal["telegram", "email"]


class ExportIn(BaseModel):
    title: str = Field(max_length=200)
    # Capped so nobody can make the server build a gigantic document.
    markdown: str = Field(max_length=200_000)


class AuditEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_name: str
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    details: dict | None = None
    created_at: datetime

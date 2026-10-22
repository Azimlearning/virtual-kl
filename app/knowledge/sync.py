import asyncio
import logging
from datetime import timezone

from .. import database
from ..models import HazardRecord
from ..repository import list_all_incident_notes, list_contexts, list_hazards
from .chroma_client import get_chroma_client, get_hazards_collection
from .neo4j_client import get_neo4j_driver

logger = logging.getLogger(__name__)


_CONTEXT_MAX_CHARS = 300


def _format_date(moment) -> str:
    """"10 July 2026 (UTC)". Spelled out, because the ISO form
    "2026-07-10T06:03:01+00:00" was easy for the model to misread (one
    answer turned a July record into "10 Oct")."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(timezone.utc)
    return f"{moment.day} {moment.strftime('%B %Y')} (UTC)"


def _hazard_summary(hazard: HazardRecord, context: str | None = None) -> str:
    """The plain-English sentence Chroma embeds and searches over.

    This is the single most important piece of the whole knowledge layer:
    Chroma doesn't understand your database columns, it only understands
    this sentence. Whatever isn't captured in words here can't be found
    later by semantic search. `context` (e.g. a news article's description)
    is appended so the AI has a real sentence to write from.
    """
    text = (
        f"{hazard.hazard_type} hazard in {hazard.location_name}, "
        f"alert level {hazard.alert_level}, severity score {hazard.severity_score}, "
        f"reported by {hazard.source}, recorded on {_format_date(hazard.timestamp)}."
    )
    if context:
        one_line = " ".join(context.split())[:_CONTEXT_MAX_CHARS]
        text += f" Context: {one_line}"
    return text


async def sync_to_chroma(hazards: list[HazardRecord], contexts: dict[str, str] | None = None) -> int:
    """Chroma's HttpClient is a blocking (sync) library under the hood, so
    the actual work runs in a background thread via asyncio.to_thread —
    same reasoning as why we don't call blocking `requests` directly from
    an async endpoint elsewhere in this app.
    """

    def _do_sync() -> int:
        client = get_chroma_client()
        collection = get_hazards_collection(client)

        ids = [h.id for h in hazards]
        if not ids:
            return 0

        contexts = contexts or {}
        documents = [_hazard_summary(h, contexts.get(h.id)) for h in hazards]
        metadatas = [
            {
                "hazard_type": h.hazard_type,
                "alert_level": h.alert_level,
                "source": h.source,
                "latitude": h.latitude,
                "longitude": h.longitude,
                # Stored as epoch seconds (not an ISO string) because
                # Chroma's `where` filter needs a numeric type to support
                # $gte/$lte range queries - this is what enables the new
                # since/until time-filtering in knowledge/query.py.
                "timestamp": h.timestamp.timestamp(),
            }
            for h in hazards
        ]

        # upsert (not add) so re-running the sync updates existing entries
        # instead of erroring on duplicate ids or creating duplicates.
        collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
        return len(ids)

    return await asyncio.to_thread(_do_sync)


async def sync_to_neo4j(hazards: list[HazardRecord]) -> int:
    driver = get_neo4j_driver()
    count = 0
    async with driver.session() as session:
        for h in hazards:
            # MERGE is Neo4j's "create if not exists, otherwise match" —
            # the graph equivalent of our Postgres upsert. Running this
            # repeatedly on the same hazard updates it in place rather
            # than creating duplicate nodes.
            await session.run(
                """
                MERGE (hz:Hazard {id: $id})
                SET hz.severity_score = $severity_score,
                    hz.alert_level = $alert_level,
                    hz.timestamp = $timestamp,
                    hz.source = $source
                MERGE (loc:Location {name: $location_name})
                SET loc.latitude = $latitude, loc.longitude = $longitude
                MERGE (ht:HazardType {name: $hazard_type})
                MERGE (hz)-[:OCCURRED_AT]->(loc)
                MERGE (hz)-[:IS_TYPE]->(ht)
                """,
                id=h.id,
                severity_score=h.severity_score,
                alert_level=h.alert_level,
                timestamp=h.timestamp.isoformat(),
                source=h.source,
                location_name=h.location_name,
                latitude=h.latitude,
                longitude=h.longitude,
                hazard_type=h.hazard_type,
            )
            count += 1
    return count


async def sync_notes_to_neo4j(notes: list) -> int:
    """Mirrors incident_notes (Postgres) into the graph as IncidentNote
    nodes, and - when a note names one - real Infrastructure or
    Organisation nodes linked to the hazard. This is how the graph gets
    genuine infrastructure/organisation entities and impact links: they're
    grounded in actual human-entered notes, not fabricated to match the
    architecture diagram's entity list.
    """
    driver = get_neo4j_driver()
    count = 0
    async with driver.session() as session:
        for note in notes:
            await session.run(
                """
                MATCH (hz:Hazard {id: $hazard_id})
                MERGE (n:IncidentNote {id: $note_id})
                SET n.note_type = $note_type, n.content = $content, n.created_at = $created_at
                MERGE (n)-[:LOGGED_FOR]->(hz)
                """,
                hazard_id=note.hazard_id,
                note_id=note.id,
                note_type=note.note_type,
                content=note.content,
                created_at=note.created_at.isoformat(),
            )
            if note.affected_infrastructure:
                await session.run(
                    """
                    MATCH (hz:Hazard {id: $hazard_id})
                    MERGE (i:Infrastructure {name: $name})
                    MERGE (hz)-[:IMPACTS]->(i)
                    """,
                    hazard_id=note.hazard_id,
                    name=note.affected_infrastructure,
                )
            if note.responding_organisation:
                await session.run(
                    """
                    MATCH (hz:Hazard {id: $hazard_id})
                    MERGE (o:Organisation {name: $name})
                    MERGE (o)-[:RESPONDED_TO]->(hz)
                    """,
                    hazard_id=note.hazard_id,
                    name=note.responding_organisation,
                )
            count += 1
    return count


async def sync_knowledge_layer() -> dict:
    """Reads current state from Postgres (source of truth) and pushes it
    into both Chroma and Neo4j. Safe to call repeatedly/on a schedule —
    both writes below are upserts, not inserts.
    """
    async with database.SessionLocal() as session:
        hazards = await list_hazards(session, limit=2000)
        notes = await list_all_incident_notes(session)
        contexts = await list_contexts(session)

    try:
        chroma_count = await sync_to_chroma(hazards, contexts)
    except Exception:
        logger.exception("[Knowledge] Chroma sync failed")
        chroma_count = 0

    try:
        neo4j_count = await sync_to_neo4j(hazards)
        notes_count = await sync_notes_to_neo4j(notes)
    except Exception:
        logger.exception("[Knowledge] Neo4j sync failed")
        neo4j_count = 0
        notes_count = 0

    logger.info(
        "[Knowledge] synced %d hazards to Chroma, %d hazards + %d notes to Neo4j (of %d total)",
        chroma_count, neo4j_count, notes_count, len(hazards),
    )
    return {
        "total_hazards": len(hazards),
        "chroma_synced": chroma_count,
        "neo4j_synced": neo4j_count,
        "notes_synced": notes_count,
    }

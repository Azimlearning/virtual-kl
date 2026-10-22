import asyncio
import re
from datetime import datetime

from .chroma_client import get_chroma_client, get_hazards_collection
from .neo4j_client import get_neo4j_driver

_WORD_PATTERN = re.compile(r"[A-Za-z]{3,}")


async def search_hazards(
    query: str, n_results: int = 5, since: datetime | None = None, until: datetime | None = None
) -> list[dict]:
    """Semantic search: finds hazards whose summary is closest in *meaning*
    to the query text, not just matching keywords. E.g. "big storm near a
    coastal city" can match a cyclone entry even without those exact words.

    since/until optionally restrict results to a timestamp range - this is
    the "time-based filtering" the architecture names, applied as a Chroma
    metadata filter (timestamp is stored as epoch seconds - see
    knowledge/sync.py - since Chroma's range filters need a numeric type).
    """

    def _do_search() -> list[dict]:
        client = get_chroma_client()
        collection = get_hazards_collection(client)

        where = None
        conditions = []
        if since is not None:
            conditions.append({"timestamp": {"$gte": since.timestamp()}})
        if until is not None:
            conditions.append({"timestamp": {"$lte": until.timestamp()}})
        if len(conditions) == 1:
            where = conditions[0]
        elif len(conditions) > 1:
            where = {"$and": conditions}

        results = collection.query(query_texts=[query], n_results=n_results, where=where)

        ids = results.get("ids", [[]])[0]
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        return [
            {"id": id_, "summary": doc, "metadata": meta, "distance": dist}
            for id_, doc, meta, dist in zip(ids, documents, metadatas, distances)
        ]

    return await asyncio.to_thread(_do_search)


async def graph_search(
    query: str, limit: int = 5, since: datetime | None = None, until: datetime | None = None
) -> list[dict]:
    """Keyword/structural search over the graph: matches individual words
    from the query against hazard type and location names. This is
    Chroma's blind spot covered - semantic search can miss an exact
    location or hazard type name if the embedding model doesn't weigh it
    heavily, but a literal substring match in the graph won't.

    since/until compare against hz.timestamp, stored as an ISO 8601 string
    (see knowledge/sync.py) - ISO 8601 sorts correctly under plain string
    comparison, so no numeric conversion is needed here unlike Chroma.
    """
    terms = [w.lower() for w in _WORD_PATTERN.findall(query)]
    if not terms:
        return []

    time_clause = ""
    params: dict = {"terms": terms, "limit": limit}
    if since is not None:
        time_clause += " AND hz.timestamp >= $since"
        params["since"] = since.isoformat()
    if until is not None:
        time_clause += " AND hz.timestamp <= $until"
        params["until"] = until.isoformat()

    driver = get_neo4j_driver()
    async with driver.session() as session:
        result = await session.run(
            f"""
            UNWIND $terms AS term
            MATCH (hz:Hazard)-[:OCCURRED_AT]->(loc:Location)
            MATCH (hz)-[:IS_TYPE]->(ht:HazardType)
            WHERE (toLower(loc.name) CONTAINS term OR toLower(ht.name) CONTAINS term){time_clause}
            RETURN DISTINCT hz.id AS id, hz.alert_level AS alert_level,
                   hz.severity_score AS severity_score, hz.source AS source,
                   loc.name AS location_name, ht.name AS hazard_type
            LIMIT $limit
            """,
            **params,
        )
        return [record.data() async for record in result]


async def hybrid_search(
    query: str, n_results: int = 5, since: datetime | None = None, until: datetime | None = None
) -> list[dict]:
    """Combines Chroma's semantic search with Neo4j's keyword/graph search
    and de-duplicates by hazard id. Vector search covers "similar in
    meaning even without exact words"; graph search covers "exact hazard
    type or location literally named in the query". Together they cover
    each other's blind spots - this is the "hybrid search" the original
    architecture called for.
    """
    vector_results = await search_hazards(query, n_results=n_results, since=since, until=until)
    graph_results = await graph_search(query, limit=n_results, since=since, until=until)

    seen_ids = {r["id"] for r in vector_results}
    combined = list(vector_results)

    for g in graph_results:
        if g["id"] in seen_ids:
            continue
        combined.append(
            {
                "id": g["id"],
                "summary": (
                    f"{g['hazard_type']} hazard in {g['location_name']}, "
                    f"alert level {g['alert_level']}, severity {g['severity_score']}, "
                    f"source {g['source']}."
                ),
                "metadata": {
                    "hazard_type": g["hazard_type"],
                    "alert_level": g["alert_level"],
                    "source": g["source"],
                },
                "distance": None,  # graph match, not a vector distance - no meaningful comparison to Chroma's scale
            }
        )
        seen_ids.add(g["id"])

    return combined


async def graph_stats() -> dict:
    """Quick sanity-check query: how many nodes of each type exist in the
    graph right now. Useful to confirm the sync actually populated Neo4j
    without needing to open the browser UI.
    """
    driver = get_neo4j_driver()
    async with driver.session() as session:
        result = await session.run(
            "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY count DESC"
        )
        records = [record.data() async for record in result]
    return {r["label"]: r["count"] for r in records}

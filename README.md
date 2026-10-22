# CISE — Ingestion Layer (Layers 1–2, hardened)

This replaces `main.py` / `main_expand.py`'s single-file prototype with a
structured service that actually persists data, matching the report's
"historical repository (PostgreSQL)" requirement.

## Run it locally (fastest path: Docker Compose)

```bash
cd cise
cp .env.example .env          # edit if needed
docker compose up --build
```

This starts Postgres + the API on `http://localhost:8000`. Check:

```bash
curl http://localhost:8000/
curl http://localhost:8000/api/hazards
curl http://localhost:8000/api/stats
```

## Run it locally (no Docker)

You'll need a Postgres instance somewhere — either install it locally, or
use a free hosted one (Supabase or Neon both work fine and take <5 minutes
to set up: create a project, copy the connection string into `.env` as
`DATABASE_URL`, using the `postgresql+asyncpg://...` scheme).

```bash
cd cise
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL to your Postgres instance
uvicorn app.main:app --reload
```

## Run the tests (no network, no database needed)

```bash
pip install -r requirements.txt
pytest -v
```

All tests run against an in-memory SQLite DB and mocked HTTP responses —
nothing here touches the real USGS/GDACS/GDELT/Open-Meteo APIs.

## Known gap to verify on your machine

The prototype's original GDELT URL used `mode=updatesjson`, which isn't a
valid mode for the DOC 2.0 API — it returns a plaintext rate-limit/error
message instead of JSON. Fixed in `app/config.py` to use `mode=artlist`
with `format=json`, which does return an `articles` array matching what
`app/workers/gdelt.py` expects (`title`, `sourcecountry`, `url`). Verify
with:

```bash
curl "https://api.gdeltproject.org/api/v2/doc/doc?query=(protest%20OR%20riot%20OR%20unrest)&mode=artlist&maxrecords=10&format=json"
```

GDELT asks for max 1 request per 5 seconds — our 30-minute poll interval
is well within that.

## Knowledge Layer (Chroma + Neo4j)

Added on top of the ingestion layer:

- **Chroma** (vector database) — semantic search over hazard summaries.
- **Neo4j** (graph database) — relationships between hazards, locations, and hazard types.
- A periodic sync job (`app/knowledge/sync.py`) reads current data from Postgres and
  upserts it into both. Postgres remains the single source of truth; Chroma and
  Neo4j are derived views, safe to wipe and rebuild at any time via `/api/knowledge/sync`.

New endpoints:
- `POST /api/knowledge/sync` — manually trigger a sync
- `GET /api/knowledge/search?q=...` — semantic search over hazards
- `GET /api/knowledge/graph-stats` — node counts in the graph

New services in `docker-compose.yml`: `chroma` (host port 8001) and `neo4j`
(browser UI on host port 7474, bolt protocol on 7687, default credentials
`neo4j` / `cisegraph123` — change this before any real deployment).

## Intelligence Layer (Ollama + RAG + guardrails)

Added on top of the knowledge layer:

- **Ollama**, running natively on your host machine (NOT in Docker — this avoids
  the complexity of GPU passthrough into a container on Windows). The app
  container reaches it via `host.docker.internal`, Docker Desktop's built-in
  DNS name for the host machine.
- **RAG pipeline** (`app/intelligence/rag.py`): retrieves relevant hazards via
  the Chroma semantic search already built in the knowledge layer, stuffs them
  into a prompt, and asks the local LLM to write a briefing grounded only in
  that retrieved data.
- **Guardrail** (`app/intelligence/guardrails.py`): a simple, explainable
  grounding_score — the fraction of words in the generated briefing that also
  appear in the retrieved context. Catches obvious fabrication; does not catch
  subtly wrong claims. Documented as a known limitation, worth stating plainly
  in your dissertation rather than overselling it.

**Before running:** install Ollama natively on Windows (not via Docker) from
https://ollama.com/download, then run `ollama pull llama3.1` to download the
model (~4.7GB, one-time).

New endpoint: `GET /api/intelligence/brief?query=...` — ask a question, get
back a grounded briefing plus its sources and grounding score.

## Gap fixes: hybrid search, statistical anomalies, fuller guardrails

- **Hybrid search**: `app/knowledge/query.py` now has `hybrid_search()`, combining
  Chroma's semantic search with a new Neo4j keyword/graph search
  (`graph_search()`), de-duplicated by hazard id. The RAG pipeline uses this;
  `/api/knowledge/search` (pure vector) and `/api/knowledge/hybrid-search`
  (combined) are both exposed for comparison/debugging.
- **Statistical weather anomalies**: `app/workers/weather.py` replaced fixed
  temperature/rain thresholds with a Z-score comparison against each city's own
  90-day rolling baseline (`refresh_climate_baselines`, run daily). Documented
  scope reduction from the original "10-year baseline" — see the docstring for
  the reasoning, worth citing directly in your limitations section.
- **Fuller guardrails**: the LLM now returns structured JSON (`StructuredBrief`
  schema — executive_summary, key_impacts, recommendations, confidence),
  validated via Pydantic. Two independent guardrails run on the output:
  `grounding_score` (word-overlap, as before) and the new `numeric_grounding_ok`
  (flags any number in the output that doesn't appear in the retrieved source
  data — catches fabricated statistics that word-overlap alone would miss).

## Dashboard (Layer 5 - Presentation)

A new `dashboard/` folder (sibling to `app/`, a separate container) runs a
Streamlit app that talks only to the FastAPI backend's existing endpoints -
it never touches Postgres/Chroma/Neo4j directly, keeping the same
separation of concerns as the rest of the system.

**Note on the architecture diagram**: it named Folium for the map. Folium is
built on Leaflet.js, which is tile-based and locked to Mercator projection -
genuine equal-area rendering isn't practically achievable with it. Plotly is
used instead: it natively supports true equal-area projections (Eckert IV,
Mollweide) as a single parameter, plus an orthographic (globe-look)
projection, all switchable live from the dashboard's sidebar. Worth stating
this substitution explicitly and its justification in your methodology
section.

**What it shows**: a live hazard map (color-coded by alert level, projection
switchable), active alert counts, a sortable event feed, and an AI Crisis
Brief panel that calls `/api/intelligence/brief` and renders the structured
output (executive summary, key impacts, recommendations) alongside both
guardrail results (`grounding_score`, `numbers_grounded`) directly in the UI -
so whoever's reading a brief can see at a glance whether to trust it.

Runs at http://localhost:8501 once the stack is up.

## Layer 1-4 gap closures (against the FYP1 report's named deliverables)

Closed the specific gaps identified in the report alignment check, all in
`app/` — **dashboard untouched** in this round.

- **ACLED worker** (`app/workers/acled.py`) — named alongside GDELT in Table 3,
  but requires free registration (email + API key), unlike GDELT. Skips
  gracefully (logs once, returns 0) if `ACLED_API_KEY`/`ACLED_EMAIL` aren't
  set. **Field names are unverified against a live response** — same
  "verify before trusting" caveat as the earlier GDELT `mode` bug; check
  once you have credentials.
- **GDELT sentiment score** — Table 3 names this as a tracked parameter.
  GDELT's `artlist` mode doesn't reliably expose per-article tone (that's a
  separate GKG dataset), so `score_sentiment()` in `app/workers/gdelt.py`
  computes it locally from the article title via a small, transparent
  lexicon. Documented as a deliberate stand-in, not GDELT's own tone score.
- **Impact estimation** (`app/impact.py`) — a simple, honest severity-to-tier
  proxy (`Green→Low`, `Orange→Moderate`, `Red→Severe`). No source provides
  real population/infrastructure exposure data, so a rigorous impact model
  isn't achievable; this is stated as a known simplification, not oversold.
- **Incident notes** (`app/models.py: IncidentNote`, `/api/incidents/{hazard_id}/notes`)
  — the "impact records, response logs, and lessons learned" Layer 2 names
  alongside the raw hazard repository. Deliberately human-entered via the
  API (no dashboard UI yet — that's future work) rather than auto-generated,
  since fabricating response data would misrepresent what happened.
- **Richer Neo4j graph** — when a note names `affected_infrastructure` or
  `responding_organisation`, `app/knowledge/sync.py` mirrors it into the
  graph as a real `Infrastructure`/`Organisation` node with an impact link
  (`IMPACTS`/`RESPONDED_TO`) — grounded in actual entered data, not
  fabricated to match the architecture diagram's entity list.
- **Time-based filtering** — `since`/`until` params on `/api/knowledge/search`,
  `/hybrid-search`, and internally in the RAG pipeline. Chroma stores
  timestamp as epoch seconds for numeric range filtering; Neo4j compares
  ISO 8601 strings directly (they sort correctly as strings).
- **Role-based prompts** (`app/intelligence/prompts.py`) — `role` param
  (`operator`/`executive`/`analyst`) reframes the same retrieved facts for
  different audiences. Guardrails apply identically regardless of role.
- **Domain-constraint guardrail** (`domain_constraints_ok`) — a third,
  independent check: flags a brief claiming a higher alert level (e.g. "Red
  alert") than anything actually retrieved. Catches an overstated-severity
  failure mode that word-overlap and numeric checks both miss.
- **Alert-triggering decision** (`alert_triggered` in the brief response) —
  the backend logic half of "before any brief... triggers an alert": True
  only when all three guardrails pass AND at least one retrieved source is
  Orange/Red. Logged for audit. The actual notification *delivery*
  (email/Telegram) is deliberately left for the dashboard/alerts-panel work.

`/api/intelligence/brief` now accepts `role` and returns `domain_constraints_ok`
and `alert_triggered` alongside the existing fields.

## Impact Analytics (Dashboard gap, closed)

`app/analytics.py` + two new endpoints (`/api/analytics/trends`,
`/api/analytics/top-regions`) + a new dashboard section — trend-over-time
(stacked bar by hazard_type) and top-affected-regions charts, both named
explicitly in the architecture's Presentation Layer description.

No source provides a clean, separate region/country field, only free-text
`location_name` in a different shape per source — `extract_region()` is a
documented heuristic (regex-based, prioritizing comma-separated suffixes
and "in X" patterns, falling back to the full string when nothing matches)
rather than a guaranteed-correct parser. Verified against real examples from
all 4 sources, including a tricky case where Open-Meteo's trailing
"(X standard deviations...)" note could be mistaken for a region — fixed to
strip that first before pattern-matching.

Aggregation happens in Python, not SQL date-grouping, to stay portable
across SQLite (tests) and Postgres (prod) without dialect-specific functions.

## Alert Prioritization (Critical/High/Moderate/Low ranking)

`app/priority.py` + `GET /api/hazards/prioritized` + a new "Top Priority
Incidents" card list on the dashboard. Named explicitly in the
architecture ("categorisation and ranking of incoming alerts based on
severity and impact").

The hard problem: `severity_score` means different things per source
(Richter magnitude vs a 1-3 GDACS score vs a weather Z-score vs a raw
fatality count) - these can't be compared as if they were the same unit.
Design: `alert_level` (already a domain-appropriate judgment each worker
makes with thresholds suited to that hazard type) sets the base score for
its tier; `severity_score` only breaks ties *within* a tier, normalized
against that source's own typical range. A Red from any source always
outranks a Green from any other - raw severity numbers are never compared
directly across sources. The 80/60/35 Critical/High/Moderate/Low
thresholds are adopted from a separate UI reference (see below), chosen
for being a clean, presentable taxonomy, not for special scientific standing.

## Dashboard visual reskin

Colors, card layout, and the severity-badge component are adapted from a
separate Next.js/v0-generated UI prototype the user built independently
(`llm-driven-ews`, not part of this repo). **Deliberately not adopted as
the actual running system** - it uses Google Gemini via a cloud API,
which would directly contradict this project's approved report
commitment to a *locally hosted* LLM for privacy. Only the visual design
(OKLCH color tokens, card borders, pill-shaped severity badges) was
ported into the existing Streamlit dashboard via CSS - the backend stays
FastAPI + Ollama + Postgres/Chroma/Neo4j, unchanged.

One real bug caught and fixed during this: the global `!important`
text-color rule was silently overriding the badges' inline colors (a
stylesheet `!important` rule beats a plain inline style) - fixed by also
marking the badge color `!important`.

40 tests total (up from 21 at the start of this session).

## Next steps toward FYP2

1. Point this at a real Postgres (Supabase/Neon free tier is fine for a demo).
2. Dashboard: alerts panel (notification delivery, Telegram bot setup needed),
   PDF/DOCX export, heatmap layer. Wrap the remaining sections (map, event
   feed) in the new card styling for visual consistency.
3. Make the AI brief panel's guardrail labels non-technical-friendly.
4. Formal testing & evaluation against historical events for the results chapter.
5. Move to managed cloud services, decide how Ollama runs in production, deploy.

## Human-in-the-loop (FYP2, step 1)

Analysts can confirm or dismiss an incident and override its severity from the
incident detail page; every decision is written to an append-only audit log
shown on the Activity page.

- **Tables** (`app/models.py`): `incident_reviews` (one row per hazard) and
  `audit_log`. Deliberately separate from `hazards`: the workers re-write every
  hazard row each poll, so a decision stored there would be overwritten. Being
  brand-new tables, `create_all` adds them on next startup - no migration.
- **Endpoints**: `POST /api/incidents/{id}/review` (`confirm`|`dismiss`),
  `POST /api/incidents/{id}/severity` (0-100), `GET /api/audit-log`.
  `GET /api/hazards/prioritized` now also returns `status`, `validated`,
  `reviewed_by`, `severity_overridden`, and applies overrides to the score/label.
- **Known limitation**: the acting user's name comes from the frontend and is
  trusted as-is. Real verification arrives with the RBAC step.
- Tests: `tests/test_reviews.py`.

## Frontend completion (FYP2, step 2)

- **Date-range dropdown** (Overview + Incidents): `?range=24h|7d|30d|all` in the
  URL; the backend's `GET /api/hazards` and `/api/hazards/prioritized` accept
  `days`. An incident's own page is always all-time, so old links never 404.
- **Clickable sources**: workers save each event's original URL
  (`hazard_links` table). `app/links.py` falls back only to a rebuilt USGS
  event-page URL; otherwise there is **no link** (earlier homepage fallbacks
  were removed because they looked like proof but proved nothing).
- **Alerts**: `app/alerts.py` sends Telegram and/or email (setup steps in its
  docstring); `alert_sends` (one row per hazard AND channel) guarantees each
  alert goes out once per channel; dismissed incidents are never sent.
  `/alerts` page shows both channels, a test button each, and per-alert status.
- **Reports**: `POST /api/reports` builds a report from live data plus the AI
  brief (clearly labelled; data-only if the LLM is unavailable), stored in the
  `reports` table. **Export**: `POST /api/export/{pdf|docx}` (`app/export.py`).
  Known limitation: PDF uses a Latin-only font, so non-Latin headlines print as "?".
- **Incident notes** panel, **plain-language fact-check** panel, **heatmap**
  toggle on the map.
- **Streamlit retired**: the `dashboard` service is gone from
  `docker-compose.yml`. The `dashboard/` folder is no longer used and can be deleted.
- Tests: `tests/test_reports.py`, `test_export.py`, `test_alerts.py`, `test_api_extras.py`.

## Round 3: live monitoring, news context, date picker, CISE branding

- **No manual refresh**: ingestion runs on a schedule (USGS/GDACS every 5 min;
  GNews, GDELT, weather, ACLED every 30 min) and alerts are dispatched every
  5 min. The dashboard shows "last data received" from `GET /` (`last_data_update`).
  Startup no longer waits for the first fetches (they run in a background task).
- **Date-range picker**: presets or a custom range, in the URL as
  `?range=7d` or `?from=2026-09-01&to=2026-09-14`. Backend: `since` (inclusive)
  and `until` (exclusive), UTC, on hazards/prioritized/analytics.
- **News context (GNews)**: `app/workers/gnews.py`. Keyword-classified (never Red),
  located by `app/geocode.py` (a built-in gazetteer: ~150 cities, ~140
  countries). GDELT now also uses it, instead of pinning to the publisher's
  country. The article description is stored (`hazard_context`) and appended
  to the sentence the AI reads. NewsAPI.org was rejected: its free plan is
  development-only. GNews free is non-commercial (fine for a dissertation).
  Weather now covers 40 cities, polled every 30 min (Open-Meteo free limit).
- **Dates**: summaries say "recorded on 10 July 2026 (UTC)" instead of an ISO
  timestamp; the prompt includes today's date; the "numbers verified" guardrail
  also flags a month name the sources never mention.
- **Email alerts** (see `.env.example`), **notes** limited to 2000 chars with a
  counter, audit-logged, included in the incident export; unknown incident = 404.
- Existing rows keep their old summary text until the next knowledge sync (~10 min).
- Tests: `tests/test_round3.py`, `test_geocode.py`, updated `test_alerts.py`.

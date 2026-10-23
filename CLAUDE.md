# Virtual KL — Claude Context

> Read this file at the start of every session, then run through `.claude/memory/preflight.md` — it's the six-question gate that turns these rules into something you actually did. Virtual KL is a township resilience hub for Sime Darby Property's Kuala Lumpur developments: live hazard fusion, a proactive AI agent that warns residents before thresholds are crossed, and a KL Twin sandbox (3D twin + synthetic residents) where operators rehearse warnings and planners test what-ifs. Built on CISE (Lisa's FYP) for the SDP University Hackathon 2026. **MVP prototype built and verified locally on 2026-10-22** (see STATUS).
> The PRD is the source of truth; this file is the short operating brief; preflight is the gate. Keep all three short.

---

## Order of authority (when docs conflict, surface it — don't resolve silently)

0. `refdocs/STATUS.md` — **where we are right now.** Phase checklist + the current module's progress. Check this first, every session.
1. `refdocs/virtual-kl-PRD.md` — **what & why.** Owns scope, architecture, roadmap, Decision Log.
2. `refdocs/changelog/DECISIONS.md` — **settled calls.** Read before re-debating an architectural choice.
3. `refdocs/plans/*.md` — **what to build & why.**
4. `refdocs/execution/*.md` — **how & in what order.**
5. `refdocs/guides/` — **operational reference.** `env_setup.md` (every variable, where to get it), `checklist.md` (pre-ship), `resident-survey.md` (persona calibration).
6. `refdocs/virtual-kl-sources.md` — **raw research** (APIs, libraries, papers, rejected options). `refdocs/brainstorm-2026-10-22.md` holds the concept and the evidence behind it. `refdocs/cise-fyp-readme.md` is the inherited CISE engineering log (background IP).

If two docs disagree, stop and ask. Don't pick one and move on.

---

## Mandatory rules

### 1. Update the changelog after every session
After any session that changed code, made a decision, or modified a plan, add an entry to **`refdocs/changelog/CHANGELOG.md`** (format is in that file). Do not skip. Even a one-line fix gets a one-line entry.

### 2. Plan before you build
Before implementing any non-trivial feature, a **plan doc** (`refdocs/plans/`) and an **execution doc** (`refdocs/execution/`) must exist. If they don't, create them before writing code.

### 3. Log decisions as ADRs
New architectural/design decision → add an ADR to `refdocs/changelog/DECISIONS.md` (Decision → Why → Rejected/Trade-off). Mark unresolved assumptions `ASSUMED:` and surface them at the next checkpoint.

### 4. Keep docs current
If you deviate from a plan during execution, update the execution doc to match reality. Stale docs are worse than no docs.

### 5. Commit straight to `main`
No feature branches. Commit to `main` and push to `origin main` (user instruction, 2026-10-22). `origin` is `https://github.com/Azimlearning/virtual-kl.git` (**public**); Lisa's repo is the local remote `lisa-fyp`. **Do not make the first push until A-15 is confirmed** (it would publish Lisa's FYP code and commit history); after that, push straight to `main`. Never force-push, never rewrite pushed history.

### 6. Don't plan around the deadline
The team owns timing and deliverables. Record what the hackathon requires (PRD §1), but never cut scope, reorder phases, or add "deadline" tasks on your own initiative.

### 7. Credit what you reuse
Reusing code or assets from online sources is allowed (D-12). Every reused file keeps its licence notice, and every source gets a row in `THIRD_PARTY_NOTICES.md` (create it with the first reuse) and in `refdocs/virtual-kl-sources.md`.

---

## The hard constraints (these are mechanism, not preference)

- **Anthropic API is the only LLM.** Frontend: `frontend/lib/kl/llm.ts`; backend: `app/intelligence/llm_client.py`. Server-side only, key from `ANTHROPIC_API_KEY`. No Ollama, no Gemini, no model calls from the browser (D-06).
- **Free data tiers + the Anthropic API only.** No paid API, hosting, or database without a new ADR (D-07).
- **Kuala Lumpur only.** The whole Federal Territory is the unit; SDP's KL East, Melawati and KLGCC are featured focus areas. No nationwide twin; expansion is roadmap (D-04).
- **AI text never reaches a person unchecked.** Anything an LLM writes for a resident, an advisory, or sandbox narration passes `frontend/lib/kl/guardrails.ts` first (CISE's `app/intelligence/guardrails.py` for the engine). Orange-and-above actions need a human approval; Red is never auto-sent (D-08).
- **No key means labelled templates, never fake AI.** Fallbacks carry `source: "template"`; vision returns 503 without a key (D-25). Live calls (agent, interview, photo check) were verified once on 2026-10-22; see STATUS.
- **Simulated means labelled.** Synthetic residents, sandbox outcomes and interviews carry `simulated: true` and a visible label; persona parameters are illustrative until the survey runs (D-10, D-23). Flooding is not simulated; the JPS feed is frozen and never used for decisions (D-22). Never invent a link, a reading, or a resident quote.
- **No personal data in the repo.** Team chat screenshots and contact details live in `../context/` and stay there (D-16). Resident data is opt-in and minimal.

---

## Stack

- **Virtual KL app** (`frontend/`, the MVP, D-18): Next.js 16 (Turbopack) · React 19 · TypeScript 5.7 strict · Tailwind 4 · Recharts · MapLibre GL 6 + deck.gl 9 over OpenFreeMap · zod · `@anthropic-ai/sdk` · vitest. npm only (`package-lock.json`). Server route handlers call the data sources and Anthropic; no database.
- **CISE engine** (`app/`, optional/roadmap): Python 3.12 (Docker image) · FastAPI · SQLAlchemy 2 async · APScheduler · Postgres 16 · Chroma · Neo4j · pytest. LLM: Anthropic.
- **Infra**: `docker-compose.yml` runs db, chroma, neo4j, app (:8000), frontend (:3000). The demo needs none of it.

## Surfaces

Two codebases in one repo. They do **not** share source.

| Surface | Root | Run | Can | Cannot |
|---|---|---|---|---|
| Virtual KL app (the demo) | `frontend/` | `cd frontend && npm run dev` | Fetch live KL data, run the agent and twin, call Claude (server side) | Reach the CISE database; call a model from the browser |
| CISE engine (optional) | `app/` | `docker compose up --build app` or `uvicorn app.main:app --reload` | Ingest global feeds, persist, RAG briefs, Telegram/email alerts, reviews, reports | Render UI |

The CISE pages inside the app (`/engine`, `/incidents`, `/alerts`, `/reports`, `/activity`) appear only when `NEXT_PUBLIC_ENGINE_ENABLED=true` and `API_BASE_URL` points at a running backend. `frontend/lib/api.ts` hand-mirrors the engine's shapes; **changing an engine response is not done until `lib/api.ts` and its consumers match.** The Virtual KL pages share one set of TypeScript types in `frontend/lib/kl/types.ts` (routes and components), so `tsc` protects that contract.

## Running it

| What | Command | Notes |
|---|---|---|
| Demo app (dev) | `cd frontend && npm install --legacy-peer-deps && npm run dev` | http://localhost:3000. `predev` copies the MapLibre worker into `public/maplibre/`. Works without any key (templates) |
| Type check | `cd frontend && npx tsc --noEmit` | Clean as of 2026-10-22 |
| Unit tests | `cd frontend && npx vitest run` | 106 pass |
| Production build | `cd frontend && npm run build` then `npm start` | If another `next dev` is running in the same folder, build with `NEXT_DIST_DIR=.next-verify` (D-26) |
| Backend tests | create a venv, `pip install -r requirements.txt`, `python -m pytest -q` | Needs Python 3.12 or Docker for `chromadb`; on 3.13/Windows `chroma-hnswlib` can't build (STATUS Known gaps). 122 pass with a stubbed import |
| Full CISE stack | `docker compose up --build` | API :8000, UI :3000, Postgres :5433, Chroma :8001, Neo4j :7474 |
| Env vars | see `refdocs/guides/env_setup.md` | `frontend/.env.local` for the demo; `.env` for the engine |

---

## Build sequence

MVP prototype (built, verified locally) → P1 Data depth (Chronos + backtest) → P2 Delivery & memory (real alerts, persistence, Groundsource) → P3 Calibration & evidence (survey) → P4 Expansion (Klang Valley, flood). Open items on the MVP itself are in STATUS "Next actions".

**Never build the second of anything until the first is green end-to-end.**

---

## When blocked

- **Open question:** check the PRD's Open Questions section. If unresolved, write your assumption to `DECISIONS.md` as `ASSUMED:`, proceed, surface at the next checkpoint.
- **Doc conflict:** stop. Quote both passages and ask. Don't pick silently.
- **Ambiguous spec:** prefer the more honest, verifiable option (label it simulated rather than make it look real), then the cheaper one. Log the choice.

---

*Companion brief to `refdocs/virtual-kl-PRD.md`. Last updated: 2026-10-22.*

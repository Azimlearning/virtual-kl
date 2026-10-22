# Virtual KL

A township resilience hub for Sime Darby Property's Kuala Lumpur developments: live haze, weather, flood and incident intelligence per development, a proactive AI agent that warns residents before conditions cross safety thresholds, and a **KL Twin sandbox** — a 3D digital twin with a synthetic resident population — where township operators rehearse warnings and SDP planners test what-ifs.

**Status:** MVP prototype built and verified locally on 2026-10-22 (live Kuala Lumpur data, 3D map, proactive agent, simulation sandbox, photo check). Live Claude calls (agent, interview, photo check) verified on 2026-10-22. Not yet deployed. See [`refdocs/STATUS.md`](refdocs/STATUS.md).

Entry for the **Sime Darby Property University Hackathon 2026** — track: People → Safety & Security.

## What it does

Scope is **Kuala Lumpur** (the Federal Territory). SDP's KL East, Melawati and KLGCC developments are the featured focus areas.

- **KL Pulse (`/`)** — a 3D map of KL with real DOE air-quality readings, SDP developments, a haze veil and a slow flyover; the 48-hour forecast against the official thresholds; MET Malaysia forecast and warnings; every reading shows its age.
- **Proactive agent (`/agent`)** — watches, anticipates, rehearses the warning on the twin, decides how much autonomy it has, and drafts complete advisories in English and Bahasa Malaysia. Orange and Red wait for a human; Red is never auto-sent. Every advisory shows its guardrail result.
- **KL Twin sandbox (`/twin`)** — thousands of simulated residents commute around a development while the real October haze is replayed (or the live forecast runs). Change when and how a warning goes out and watch who protects themselves in time; click a resident to interview them. Everything is labelled simulated, with illustrative parameters.
- **Photo check (`/check`)** — a vision model reads a resident's photo and the system compares it with the nearest live DOE reading (needs an Anthropic key).
- **Methods & limits (`/about`)** — live source status, what is simulated, known limits.

Underneath sits **CISE** (Crisis Intelligence Synthesis Engine), Lisa's final-year project: global hazard ingestion, Postgres, Chroma + Neo4j, a RAG briefing with three guardrails, Telegram/email alerts and human review. It is kept as the optional engine and roadmap; its engineering log is in [`refdocs/cise-fyp-readme.md`](refdocs/cise-fyp-readme.md).

## Requirements

- Node 20+ and npm (the demo app needs nothing else)
- An Anthropic API key for live Claude text and the photo check (without it the app runs on clearly labelled templates)
- For the optional CISE engine: Docker Desktop and Python 3.12

## Setup

```bash
cp frontend/.env.example frontend/.env.local     # add ANTHROPIC_API_KEY (optional for a first look)
cd frontend
npm install --legacy-peer-deps
```

Every environment variable, and where to get it: [`refdocs/guides/env_setup.md`](refdocs/guides/env_setup.md).

## Usage

```bash
cd frontend && npm run dev                        # http://localhost:3000
cd frontend && npx vitest run                     # 79 unit tests
cd frontend && npx tsc --noEmit                   # type check
cd frontend && npm run build && npm start         # production build

# Optional CISE engine:
docker compose up --build                         # API :8000, Postgres, Chroma, Neo4j
python -m pytest -q                               # backend tests (Python 3.12 / Docker; see STATUS)
```

Deploying: Vercel free tier, root directory `frontend/`, environment variable `ANTHROPIC_API_KEY` (not deployed yet).

## Project layout

```
frontend/            The Virtual KL app (Next.js): app/ (pages + /api routes), components/kl/ (map, charts, consoles),
                     lib/kl/ (data sources, scoring, policy, guardrails, agent, photo check), lib/twin/ (simulation), tests/
app/                 CISE engine (FastAPI): workers/ (feeds), knowledge/ (Chroma + Neo4j), intelligence/ (Claude client, RAG, guardrails)
tests/               pytest suite for the engine
refdocs/             PRD, STATUS, decisions, plans, execution docs, guides, research
.claude/             Agent config: preflight, subagents, commands, secret-guard hook
docker-compose.yml   db, chroma, neo4j, app, frontend (only for the optional engine)
```

## Documentation

| Doc | What's in it |
|---|---|
| [`refdocs/STATUS.md`](refdocs/STATUS.md) | Where the build actually is right now |
| [`refdocs/virtual-kl-PRD.md`](refdocs/virtual-kl-PRD.md) | Scope, architecture, roadmap, decision log |
| [`refdocs/brainstorm-2026-10-22.md`](refdocs/brainstorm-2026-10-22.md) | The concept and the research behind it |
| [`refdocs/stress-test-2026-10-23.md`](refdocs/stress-test-2026-10-23.md) | Stress test of the build and of the idea: what broke, what survived, what a judge will ask |
| [`refdocs/changelog/CHANGELOG.md`](refdocs/changelog/CHANGELOG.md) | Session-by-session history |
| [`refdocs/changelog/DECISIONS.md`](refdocs/changelog/DECISIONS.md) | Why things are the way they are |
| [`refdocs/guides/env_setup.md`](refdocs/guides/env_setup.md) | Every environment variable and where to get it |
| [`refdocs/guides/checklist.md`](refdocs/guides/checklist.md) | Pre-ship checklist |
| [`refdocs/guides/resident-survey.md`](refdocs/guides/resident-survey.md) | The resident survey that calibrates the synthetic population |
| [`refdocs/research-predictive-models-2026-10-22.md`](refdocs/research-predictive-models-2026-10-22.md) | Research on predictive models for a competitive edge |
| [`refdocs/cise-fyp-readme.md`](refdocs/cise-fyp-readme.md) | Inherited CISE engineering log (background IP) |
| [`CLAUDE.md`](CLAUDE.md) | Operating brief for AI sessions on this repo |

## Credits and IP

CISE is pre-existing work by Nurlisa Nabiha (final-year project) and is disclosed as background IP for the hackathon. Material use of AI tools in building Virtual KL is disclosed as the hackathon terms require. No third-party source code has been copied into this repo; open-source dependencies are listed in `package.json` and `requirements.txt`, and data/tile sources are credited in the app (`/about`) and in `refdocs/virtual-kl-sources.md`.

# Execution — MVP prototype

> Plan: `refdocs/plans/2026-10-22-mvp-prototype.md`. Tasks run top to bottom. **Testing is batched (user instruction 2026-10-22): implement tasks 1–9 first, then run the single verification batch in Task 10.** Each task still lists its Verify step; those are executed together in Task 10, not one by one.
> If reality diverges from this doc, **edit this doc** (CLAUDE.md rule 4).

## Before starting

- Read `CLAUDE.md`; preflight Q5 (guardrails + API contract) applies to every AI-text task.
- Node 24 / npm 11 available; Python 3.13 available (Docker uses 3.12). No `ANTHROPIC_API_KEY` in this environment — LLM paths are tested with mocks.
- All data sources verified live on 2026-10-22 (STATUS ledger).

---

### Task 1 — Frontend foundation
- **Files:** `frontend/package.json` (+ `package-lock.json`), delete `frontend/pnpm-lock.yaml`, `frontend/lib/model.ts`, `frontend/lib/auth-client.ts`, `frontend/app/api/auth/session/route.ts`, `frontend/components/auth-form.tsx`, `frontend/app/sign-in/`, `frontend/app/sign-up/`; `git mv frontend/app/page.tsx frontend/app/engine/page.tsx`; `frontend/next.config.mjs` (stop ignoring type errors once clean); `frontend/vitest.config.ts`.
- **Steps:** remove unused deps (`firebase`, `firebase-admin`, `drizzle-orm`, `pg`, `@types/pg`, `ai`, `@ai-sdk/google`); add `@anthropic-ai/sdk`, `maplibre-gl`, `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/mapbox`, `vitest`; add `test` script; `npm install --legacy-peer-deps`.
- **Verify (Task 10):** `npm install` clean; no `firebase|gemini|@ai-sdk` strings remain.

### Task 2 — KL data layer (`frontend/lib/kl/`)
- **Files:** `types.ts`, `geo.ts` (KL centre, focus areas with OSM sources), `sources.ts` (DOE, MET forecast + warnings, Open-Meteo AQ + ensemble, JPS), `scoring.ts`, `policy.ts`, `snapshot.ts`, `app/api/kl/snapshot/route.ts`.
- **Steps:** every fetcher returns `{ ok, data, error, fetchedAt }` and validates with zod; snapshot assembles stations, hourly series (past + 48 h), bias-adjusted forecast, ensemble rain probabilities, MET KL forecast/warnings, stale JPS layer, freshness per source.
- **Verify (Task 10):** unit tests for scoring/policy/bias/ensemble maths with fixture JSON; live `GET /api/kl/snapshot` returns `stations.length ≥ 2` and per-source freshness.

### Task 3 — LLM wrapper and guardrails
- **Files:** `lib/kl/llm.ts`, `lib/kl/guardrails.ts`.
- **Steps:** `generateJson`/`generateText` over `@anthropic-ai/sdk` (model from `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`), returning `{ source: "claude" | "template" }`; throws a clear error naming `ANTHROPIC_API_KEY` only where a key is mandatory (vision). Guardrails: numeric grounding, level overstatement, completeness (what/where/when/action), claim checks.
- **Verify (Task 10):** guardrail unit tests (passing and failing messages); wrapper test with a fake client.

### Task 4 — Proactive agent
- **Files:** `lib/kl/agent.ts`, `app/api/agent/route.ts`.
- **Steps:** Watch → Anticipate → Simulate (calls the twin engine) → Decide → Act; Green auto, Orange/Red `pending-approval`; EN + BM advisories per persona group via Claude or templates; guardrails run on every advisory.
- **Verify (Task 10):** agent test with a fixed snapshot and mocked LLM; `POST /api/agent` returns 5 steps and ≥ 1 advisory.

### Task 5 — Twin engine
- **Files:** `lib/twin/prng.ts`, `types.ts`, `personas.ts`, `engine.ts`, `scenarios.ts`.
- **Steps:** seeded population around a focus area; per-resident reach/trust/act decisions; expected and sampled exposure; baseline + intervention comparison; replay window selection around the real peak.
- **Verify (Task 10):** determinism, monotonicity (earlier + more complete warning never worse than none), persona-share sums, window selection tests.

### Task 6 — Photo check
- **Files:** `lib/kl/check.ts`, `app/api/check/route.ts`.
- **Steps:** vision prompt → zod-validated result; corroboration logic against nearest DOE reading; no key → 503 with a clear message.
- **Verify (Task 10):** corroboration unit tests; route returns 503 without a key.

### Task 7 — Shell and shared UI
- **Files:** `components/app-shell.tsx`, `components/brand-logo.tsx`, `app/layout.tsx`, `app/globals.css` (additions only), `components/kl/*` shared pieces (freshness chip, level badge, stat cards).
- **Steps:** Virtual KL nav (Pulse, Agent, Twin, Photo check, About); CISE engine pages only when `NEXT_PUBLIC_ENGINE_ENABLED=true`; dark theme default.

### Task 8 — Pages and map
- **Files:** `components/kl/kl-map.tsx`, `forecast-chart.tsx`, `app/page.tsx`, `app/agent/page.tsx`, `components/kl/agent-console.tsx`, `app/twin/page.tsx`, `components/kl/twin-view.tsx` (+ controls, outcome chart, interview panel), `app/check/page.tsx`, `components/kl/photo-check.tsx`, `app/about/page.tsx`, `app/api/twin/interview/route.ts`.
- **Verify (Task 10):** headless screenshots of `/`, `/agent`, `/twin`, `/check`, `/about`.

### Task 9 — Backend LLM swap and docs of record
- **Files:** `app/intelligence/llm_client.py`, `app/config.py`, `requirements.txt`, `docker-compose.yml`, `.env.example`, `tests/test_api_extras.py` (Ollama mention), new `tests/test_llm_client.py`; `frontend/.env.example`.
- **Steps:** Anthropic async client behind the same `generate_completion(prompt) -> str`; remove Ollama everywhere.

### Task 10 — Verification batch (run together, once)
1. `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`
2. Backend: create venv, `pip install -r requirements.txt`, `python -m pytest -q` (record verbatim result; fall back to Docker if the install fails on Python 3.13)
3. `npm start` in the background; `curl` `/api/kl/snapshot`, `POST /api/agent`, `POST /api/check` (expect 503 without a key)
4. Headless Chrome screenshots of every page; inspect each
5. Fix what's broken, re-run only what failed, record everything in the STATUS ledger

---

## What actually happened (written after the build)

- Tasks 1–9 were implemented in one pass; Task 10 ran as one batch and then iterated on what it found (STATUS lists the defects).
- **Deviation — Task 5 (backend KL registry):** dropped. Focus areas live in `frontend/lib/kl/geo.ts` with cited sources because the MVP runs without the backend.
- **Deviation — Task 8 (map):** added `scripts/copy-maplibre-worker.mjs` (predev/prebuild), inline container positioning, a dark-basemap CSS filter, animated resident positions and a slow Pulse flyover — all discovered or requested after the first review.
- **Deviation — Task 2:** air-quality history extended from 10 to 21 days; the replay now picks a real onset (a crossing after ≥ 6 calm hours) and starts 24 h earlier.
- **Deviation — Task 10:** backend tests ran with a stubbed `chromadb` (Python 3.13/Windows can't build `chroma-hnswlib`; no Docker). Verification builds use `NEXT_DIST_DIR=.next-verify` because another session ran `next dev` in the same folder.
- **Not done:** live Claude calls (no key), deployment, push.

## Wrap-up (do not skip)

- [ ] `refdocs/STATUS.md` — phase table updated, verification ledger updated with what was actually run
- [ ] `refdocs/changelog/CHANGELOG.md` — session entry added
- [ ] `refdocs/changelog/DECISIONS.md` — new ADRs (D-18 to D-23), resolved/updated `ASSUMED:` items
- [ ] PRD §3, §4, §6, §7, §8 updated to the shipped scope
- [ ] This doc updated to match what actually happened

# Execution — P0 Foundation

> Plan: `refdocs/plans/2026-10-22-p0-foundation.md`. Tasks run top to bottom. Each task carries its own **Verify** step, and a task is not done until its Verify actually passes — not when the code compiles.
> If reality diverges from this doc, **edit this doc** (CLAUDE.md rule 4). A stale execution doc is worse than none.

## Before starting

- Read `CLAUDE.md` and walk `.claude/memory/preflight.md`.
- Have an Anthropic API key ready (Task 4 needs it for the live check; everything else runs without it).
- Docker Desktop running (only needed for the Docker fallback in Task 1 and the stack check in Task 6).
- Nothing else must be green — this phase makes things green.

---

### Task 1 — Python environment and test baseline
- **Files:** none (environment only); `refdocs/STATUS.md` ledger.
- **Steps:**
  1. `py -3.12 --version` — if available: `py -3.12 -m venv .venv`; otherwise `python -m venv .venv` (3.13) and note it.
  2. Activate (`. .venv/Scripts/activate` in Git Bash) and `pip install -r requirements.txt`.
  3. If install fails on `chromadb` under 3.13: fall back to Docker — `docker compose build app`, then `docker compose run --rm -v "$PWD/tests:/app/tests" -v "$PWD/pytest.ini:/app/pytest.ini" app python -m pytest -v` (install pytest deps in the image if missing). Record the path taken.
  4. `python -m pytest -v`.
- **Verify:** pytest completes; record `N passed / M failed` verbatim in the STATUS ledger. Failures unrelated to P0 go into Known gaps with their first error line.

### Task 2 — Frontend install and first build
- **Files:** none yet.
- **Steps:** `cd frontend && npm install --legacy-peer-deps && npx tsc --noEmit && npm run build`.
- **Verify:** capture the exact errors. Expected (unconfirmed): module-not-found for `@/lib/firebase/client` and `@/lib/firebase/admin`. Record the actual list before changing anything.

### Task 3 — Remove dead frontend code and dependencies
- **Files:** `frontend/lib/model.ts`, `frontend/lib/auth-client.ts`, `frontend/app/api/auth/session/route.ts`, `frontend/components/auth-form.tsx`, `frontend/app/sign-in/page.tsx`, `frontend/app/sign-up/page.tsx`, `frontend/package.json` (+ lockfile via npm).
- **Steps:**
  1. Grep each file's importers first (`grep -rn "auth-form\|auth-client\|sign-in\|sign-up\|lib/model" frontend/app frontend/components frontend/lib`). Delete only what has no live importer, and fix links that point at removed pages.
  2. Remove npm deps with no remaining import (`@ai-sdk/google`, `ai`, `firebase`, `firebase-admin`, `drizzle-orm`, `pg` are candidates — grep each before `npm uninstall`).
  3. Decide on one lockfile: keep `package-lock.json` (Docker uses npm); delete `pnpm-lock.yaml` and say so in the changelog.
- **Verify:** `npx tsc --noEmit` and `npm run build` succeed; `grep -rni "firebase\|gemini\|@ai-sdk" frontend --include=*.ts --include=*.tsx --include=package.json` returns nothing.

### Task 4 — Anthropic LLM client
- **Files:** `app/intelligence/llm_client.py`, `app/config.py`, `requirements.txt`, `docker-compose.yml`, `.env.example`, `refdocs/guides/env_setup.md`, `app/intelligence/rag.py` and `app/alerts.py` (Ollama mentions), `tests/test_api_extras.py` (Ollama mention), possibly a new `tests/test_llm_client.py`.
- **Steps:**
  1. **Read the current Anthropic Python SDK docs and model list first** (use the `claude-api` skill). Confirm the ids for A-05 and the async client usage. Write down what you confirmed in the changelog.
  2. Add `anthropic_api_key`, `anthropic_model` (default `claude-sonnet-5-5`), `anthropic_model_fast` (default `claude-haiku-5-5`) to `Settings`; remove `ollama_host`, `ollama_model`.
  3. Replace the body of `generate_completion(prompt)` with an async Anthropic Messages call (temperature 0.2, a sensible `max_tokens`), keeping the signature. Raise a clear error naming `ANTHROPIC_API_KEY` when it's blank.
  4. Swap `ollama` for `anthropic` (pinned) in `requirements.txt`; update compose env (`ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}` etc., delete `OLLAMA_*`); update `.env.example` and the env guide (remove the "Deprecated" rows).
  5. Update remaining Ollama references in code comments/messages and in `tests/test_api_extras.py`.
  6. Add a unit test that monkeypatches the SDK client and asserts the request carries the configured model and the prompt.
- **Verify:** `python -m pytest -v` still passes (same count + new test); `grep -rni ollama app tests requirements.txt docker-compose.yml .env.example` returns nothing; with a real key, `uvicorn app.main:app` then `curl "http://localhost:8000/api/intelligence/brief?query=haze"` returns JSON containing `grounding_score`.

### Task 5 — KL development registry
- **Files:** new `app/developments.py` (static data + loader), `app/main.py` (route), `app/schemas.py` (response model), `frontend/lib/api.ts` (type + fetch helper — contract invariant), new `tests/test_developments.py`.
- **Steps:**
  1. For KL East, Melawati, KLGCC Resort: find a public centroid (SDP's site, OpenStreetMap). Record `source_url` per entry. If none can be cited, set coordinates to `null`.
  2. Fields: `slug`, `name`, `area_acres` (from deck [s8]), `latitude`, `longitude`, `radius_km`, `coordinate_source`, `notes` (Melawati: "listed as Ampang Jaya in IAR 2025 — A-01").
  3. `GET /api/developments` returns the list; mirror the type in `frontend/lib/api.ts`.
- **Verify:** `python -m pytest tests/test_developments.py -v` passes; `curl http://localhost:8000/api/developments` shows three entries with sources or explicit nulls; `npx tsc --noEmit` passes.

### Task 6 — Stack run and README check
- **Files:** `README.md` (only if a command is wrong), `refdocs/STATUS.md`.
- **Steps:** `cp .env.example .env` (fill key), `docker compose up --build`, open http://localhost:3000 and http://localhost:8000/.
- **Verify:** both respond; every README Setup/Usage command was run once; corrections made and noted.

---

## Wrap-up (do not skip)

- [ ] `refdocs/STATUS.md` — phase table updated, verification ledger updated with what was actually run
- [ ] `refdocs/changelog/CHANGELOG.md` — session entry added
- [ ] `refdocs/changelog/DECISIONS.md` — any new ADR, any resolved `ASSUMED:` (A-01, A-03, A-05 are likely to move)
- [ ] This doc updated to match what actually happened

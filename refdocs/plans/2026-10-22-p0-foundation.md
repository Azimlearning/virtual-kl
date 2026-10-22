# Plan — P0 Foundation

> Phase P0 of `refdocs/virtual-kl-PRD.md` §6. Execution doc: `refdocs/execution/2026-10-22-p0-foundation.md`.
> A plan says **what and why**. The execution doc says **how and in what order**. Keep them separate — when they merge, both stop being read.

## Why this exists

The repo is CISE as Lisa left it for her FYP. Nothing about Virtual KL can be built safely until the existing code runs here, the LLM is the one we've committed to (Anthropic, D-06), leftovers from earlier prototypes stop breaking the build, and the app knows which KL developments it serves (D-04). Right now the backend tests don't even import (`asyncpg` missing) and the frontend imports files that don't exist.

## What's already covered (no work needed)

- Ingestion workers, persistence, dedupe, scheduling (`app/workers/`, `app/repository.py`, `app/scheduler.py`)
- Knowledge layer: Chroma + Neo4j sync and hybrid search (`app/knowledge/`)
- RAG brief with structured output and three guardrails (`app/intelligence/rag.py`, `guardrails.py`, `prompts.py`, `schemas.py`)
- Alerts (Telegram/email), human review, audit log, reports and PDF/DOCX export
- The Next.js pages and the `lib/api.ts` contract layer
- 17 backend test files with mocked HTTP and in-memory SQLite
- `generate_completion(prompt) -> str` is already a single seam that tests monkeypatch — the Anthropic swap only has to replace its body

## Scope

**In:**
1. A working Python environment and a **green backend test run** (baseline number recorded).
2. A **green frontend build**: remove the dangling Firebase auth code paths and the dead Gemini `lib/model.ts`, and drop npm dependencies nothing imports.
3. **Anthropic swap**: `app/intelligence/llm_client.py` calls the Anthropic Messages API; `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_FAST` in config, `.env.example`, `docker-compose.yml`, env guide; `ollama` removed from `requirements.txt`, config, compose and docs; error path when the key is missing is loud and clear.
4. **KL development registry**: KL East, Melawati, KLGCC Resort (A-01) with name, slug, centroid and an approximate radius, each coordinate citing its public source (A-03); served at `GET /api/developments`; a test.
5. README "Setup/Usage" commands actually executed and corrected where wrong.

**Out (and why):**
- New data workers and per-development scoring — P1, needs the registry first.
- Any agent, forecasting or sandbox work — P2/P3.
- Deployment/hosting — no target chosen (PRD §8).
- Renaming the GitHub repository — Lisa's decision on GitHub, not a code task.
- Changing the knowledge layer or guardrails beyond what the swap requires.

## Approach

- **Environment:** prefer Python 3.12 to match the Docker image (`python:3.12-slim`). If only 3.13 is available and `chromadb==0.5.20` won't install, run the tests inside a container built from the existing Dockerfile with `tests/` mounted, and record which path was used.
- **Anthropic swap:** keep `async def generate_completion(prompt: str) -> str` so every caller and every monkeypatch in tests keeps working. Use the official `anthropic` SDK's async client. Read the current SDK and model docs first (A-05) — do not write the call from memory. Keep temperature low as CISE did (0.2).
- **Frontend cleanup:** confirm with grep and `npx tsc --noEmit` what is truly unused before deleting. `lib/auth.ts` already stubs a single operator; sign-in/sign-up pages and `auth-form.tsx` depend on the missing Firebase client — remove that dead path rather than resurrect Firebase.
- **Registry:** a small static data module plus a read-only endpoint. Coordinates come from a cited public source; if a value can't be sourced, leave the development's coordinates null and say so rather than guess.

## Risks & unknowns

| Risk / unknown | Confidence | Mitigation |
|---|---|---|
| `chromadb==0.5.20` installs on Python 3.13 | Low — not checked | Use 3.12 or run tests in Docker |
| Other tests fail once imports work (hidden breakage in CISE) | Unknown — suite has never run here | Record failures verbatim in STATUS; fix only what P0 touched, list the rest |
| Anthropic SDK method names / model ids (`claude-sonnet-5-5`) | Medium — ids come from the session environment, SDK API not yet re-read | Read the SDK docs (or the `claude-api` skill) before writing the client |
| Removing Firebase files breaks a page someone wanted | Medium | `lib/auth.ts` says Firebase was intentionally removed; check with Lisa if sign-in pages matter |
| `next build` fails for reasons beyond Firebase | Unknown — never built here | Fix minimal; record the rest in Known gaps |
| Melawati is in Selangor, not KL (A-01) | Open conflict | Include it flagged; confirm with the team |
| No public, citable centroid for a development | Medium | Null coordinates + note, never invent |

## Definition of done

This phase is done when every line below is true and has been *observed*, not assumed:

- `python -m pytest -v` passes, and the pass count is recorded in the STATUS ledger.
- `cd frontend && npx tsc --noEmit` and `npm run build` both succeed.
- `grep -rni "ollama\|gemini\|firebase" app frontend/app frontend/components frontend/lib requirements.txt docker-compose.yml .env.example` returns nothing (docs excepted).
- With a real `ANTHROPIC_API_KEY`, `GET /api/intelligence/brief?query=haze` returns a brief with `grounding_score`, `numbers_grounded`, `domain_constraints_ok` fields; without a key the app logs one clear error naming the variable.
- `GET /api/developments` returns the KL developments, each with its coordinate source (or explicit null), covered by a test.
- STATUS, CHANGELOG, env guide and `.env.example` reflect all of the above.

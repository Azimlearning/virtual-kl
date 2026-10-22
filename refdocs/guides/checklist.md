# Pre-Ship Checklist — Virtual KL

> Run the relevant section before pushing, deploying, or calling a phase done.
> Not every item applies to every change — use judgement based on what actually changed. But read the list; that's where you notice the thing you forgot.

---

## Every change

- [ ] **It was actually run.** Not "it compiles" — executed, and the result observed. If it wasn't run, say so rather than implying otherwise.
- [ ] **Build passes** — `docker compose up --build` (full stack) and/or `cd frontend && npm run build`
- [ ] **Tests pass** — `python -m pytest -v` (from the repo root, inside the venv). As of 2026-10-22 the suite can't import until P0 installs dependencies — see STATUS.
- [ ] **Lint/type check clean** — `cd frontend && npx tsc --noEmit`. (`npm run lint` calls `eslint`, which isn't installed yet — STATUS Known gaps.)
- [ ] **No secrets staged** — `git status` shows no `.env*`; no key literal in the diff
- [ ] **No stray debug output** left in the diff — console logs, print statements, commented-out experiments
- [ ] **Changelog entry added** — `refdocs/changelog/CHANGELOG.md`, including an honest **Verified** line
- [ ] **STATUS.md reflects reality** — the phase table doesn't round up, and the verification ledger has a row for what you just ran
- [ ] **Docs match what you built** — if the work diverged from the execution doc, that doc is edited, not left stale

---

## AI output (this project's own rule)

- [ ] Every new LLM output that reaches a resident, an alert, a report or sandbox narration passes `app/intelligence/guardrails.py`
- [ ] Simulated or illustrative results carry `simulated: true` in the API and a visible label in the UI
- [ ] No action at Orange or above is sent without an approval record; nothing at Red is auto-sent
- [ ] The prompt/response path was tested with the LLM mocked (tests monkeypatch `generate_completion`)

---

## New dependency

- [ ] Recorded in `refdocs/virtual-kl-sources.md` with its license and why it was chosen
- [ ] License is compatible with this project's distribution (reuse is allowed per D-12, but the notice must travel with the code)
- [ ] Its actual docs/types were read — the API was not recalled from memory
- [ ] Considered-and-rejected alternatives noted, so nobody re-derives that comparison
- [ ] Backend: added to `requirements.txt` with a pinned version. Frontend: installed with npm (`package-lock.json` is the lockfile Docker uses)

## Reused code or assets

- [ ] Original licence notice kept in or next to the reused file
- [ ] Row added to `THIRD_PARTY_NOTICES.md` (create it with the first reuse) and to `virtual-kl-sources.md`

---

## New environment variable

- [ ] Added to `refdocs/guides/env_setup.md` with where to get it
- [ ] Added to `.env.example` with a blank/fake value
- [ ] Added to the `app` service's `environment:` block in `docker-compose.yml` and to `app/config.py`
- [ ] Missing-variable case fails loudly at startup, naming the variable (required ones only)

---

## Architectural decision

- [ ] ADR in `refdocs/changelog/DECISIONS.md` — Decision → Why → Trade-offs/rejected
- [ ] Same id added to the PRD's §7 Decision Log
- [ ] Any `ASSUMED:` it resolves is deleted from the assumptions list

---

## Backend ↔ frontend contract

- [ ] A changed response shape in `app/schemas.py` or a FastAPI route is mirrored in `frontend/lib/api.ts` (types + fetch helper)
- [ ] Every consumer of that type in `frontend/app/` and `frontend/components/` still compiles (`npx tsc --noEmit`)
- [ ] New endpoints are listed in the PRD architecture if they're user-facing

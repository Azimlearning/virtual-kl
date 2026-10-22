# Preflight — Virtual KL Session Start

> Read this at the start of every session, before touching code.
> One page, six questions, then you can build. CLAUDE.md is the reference; this is the gate.

---

## 1. Where are we?

Open `refdocs/STATUS.md`. Find the current phase and the one next action.
If STATUS's claims and the code disagree, **that's the session's first task** — not the thing you were about to do.

---

## 2. Which codebase am I working in?

| Surface | Root | Talks to | Contract file |
|---|---|---|---|
| Virtual KL app (the demo) | `frontend/` | Free data sources + Anthropic API, from server code only | `frontend/lib/kl/types.ts` (shared by routes and components) |
| CISE engine (optional) | `app/` | Postgres, Chroma, Neo4j, Anthropic API, global feeds | `app/schemas.py`; mirrored by `frontend/lib/api.ts` for the CISE pages |

They don't share source and nothing syncs them. If you touch both in one session, track both in the changelog entry. `refdocs/cise-fyp-readme.md` describes the inherited engine — read it before changing an existing CISE module. Other sessions may be editing `frontend/` at the same time (design work): build with `NEXT_DIST_DIR=.next-verify` and don't revert files you didn't write.

---

## 3. Does a plan exist for what I'm about to build?

Non-trivial feature → a plan doc in `refdocs/plans/` **and** an execution doc in `refdocs/execution/`.
If neither exists, write them first (`/plan-feature`). If one exists but reality has moved, update it before building on it.

---

## 4. Has this already been decided?

Skim `refdocs/changelog/DECISIONS.md` before re-opening an architectural choice. If your plan contradicts an ADR, you need a new ADR that says why — not a silent reversal.

Check the open `ASSUMED:` list at the bottom of that file. If today's work is load-bearing on one of them, **confirm it before you build**, not after. (A-01 Melawati, A-05 model ids and A-11 reuse permission are the ones most likely to bite.)

---

## 5. Will anything I add reach a person without passing the guardrails — or change the API without updating the frontend?

Two rules that break silently, because the first half compiles and passes tests on its own:

- **AI output:** any LLM text that reaches a resident, an advisory, or sandbox narration must go through `frontend/lib/kl/guardrails.ts` (engine: `app/intelligence/guardrails.py`), and anything simulated must carry `simulated: true` plus a UI label. A fallback is a labelled template, never presented as AI (D-25). Orange+ actions need an approval record; Red is never auto-sent (D-08, D-10). There is no hook for this — it's on you; the checklist's "AI output" section is the backstop.
- **API contract:** for the Virtual KL app, change the type in `frontend/lib/kl/types.ts` and let `npx tsc --noEmit` find every consumer. For the CISE engine, a changed response in `app/schemas.py` or `app/main.py` is not done until `frontend/lib/api.ts` and its consumers match.

Also: a new environment variable touches five places (`app/config.py` or `frontend/lib/kl/llm.ts`, `.env.example` / `frontend/.env.example`, `docker-compose.yml`, `refdocs/guides/env_setup.md`, changelog).

---

## 6. Will I close the session properly?

`/session-end` — changelog entry, STATUS phase table, verification ledger, any new ADR, then commit and push to `main`.
The changelog entry is mandatory after any session that changed code, made a decision, or modified a plan. Even a one-line fix gets a one-line entry.

---

## Quick links

| Doc | Purpose |
|---|---|
| `refdocs/STATUS.md` | Where the build actually is |
| `CLAUDE.md` | Operating brief — rules, constraints, stack |
| `refdocs/virtual-kl-PRD.md` | Scope, architecture, roadmap, decision log |
| `refdocs/changelog/DECISIONS.md` | Settled calls — read before re-debating |
| `refdocs/guides/env_setup.md` | Every env var, where to get it |
| `refdocs/guides/checklist.md` | Pre-ship checklist |
| `refdocs/plans/` · `refdocs/execution/` | What/why · how/in what order |

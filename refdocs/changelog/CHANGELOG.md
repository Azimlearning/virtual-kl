# Virtual KL — Changelog

> Mandatory session log. Add an entry after **every** session where code changed, a decision was made, or a plan was modified. Newest first. Even a one-line fix gets a one-line entry.

Entry format:
```
### YYYY-MM-DD — [short summary of session goal]
- **Changed:** what files/components were touched and why
- **Decided:** any architectural or design decisions and the reasoning
- **Deviations:** anything that differed from the plan, and why
- **Verified:** what was actually run, and the result (not "should work")
- **Known issues / next steps:** what was left open
```

Those five lines are the floor, not the ceiling. Add these when the session earns them — a debugging session in particular is unreadable without the first two:
- **Reported:** the symptom in the user's own words, before you knew the cause
- **Diagnosed:** what you found, and how you proved it — the reproduction, not the hypothesis
- **Trade-off:** what this change costs, and who it costs it to
- **Noted, not changed:** something you found and deliberately left alone, so the next session doesn't re-investigate it

Rules that make this file worth keeping:
- **"Verified" means a command was run.** Name it and give the result. If nothing was run, write "nothing verified this session" — that is useful information.
- **Deviations are the most valuable line.** A plan that changed silently is a plan nobody will trust next time.
- **Write what you learned, not what you touched.** "Fixed the player" ages into nothing. "The provider's iframe navigates the top context, which sandbox flags block" is still worth reading in six months.
- Don't rewrite history. Corrections go in a new entry that references the old one.

---

## [Unreleased]

### 2026-10-22 — MVP prototype built and verified (KL scope, one-shot build, batched testing)
- **Reported:** user: scope to Kuala Lumpur (the state, not Malaysia); build a well-enough prototype with a demo link and video in one shot, testing in bunches; later: "it looks like a plain dashboard — where is the simulation of KL?"
- **Changed:** `frontend/` rebuilt as the Virtual KL app — `lib/kl/*` (sources, snapshot, scoring, policy, guardrails, templates, agent, check, llm, met, geo), `lib/twin/*` (seeded population engine, personas, interview), `app/api/{kl/snapshot,agent,check,twin/interview}`, pages `/`, `/agent`, `/twin`, `/check`, `/about`, `components/kl/*` (3D map, charts, consoles), 5 vitest files. Removed Firebase/Gemini/Drizzle remnants, `ingestion-bar`, `pnpm-lock.yaml`; moved the CISE overview to `/engine`. Backend: `app/intelligence/llm_client.py` now calls Anthropic; config, compose, requirements, `.env.example`, a new `tests/test_llm_client.py`. `git remote`: Lisa's repo renamed `lisa-fyp`, `origin` = `Azimlearning/virtual-kl`. Docs: plan + execution for the MVP, ADRs D-18–D-26, PRD sections 3/4/6/7/8, STATUS.
- **Decided:** D-18 (standalone Next.js app), D-19 (CAMS + bias adjustment; Chronos deferred), D-20 (batch verification), D-21 (Vercel, not deployed), D-22 (JPS frozen), D-23 (illustrative personas), D-24 (MapLibre + deck.gl), D-25 (templates, never fake AI), D-26 (isolated verification builds); D-04 revised to the whole Federal Territory.
- **Deviations:** (1) The plan listed a KL development registry in the backend; it became `frontend/lib/kl/geo.ts` focus areas because the MVP runs without the backend. (2) P0's Python-environment task could not use Python 3.13 (no `chroma-hnswlib` wheel) or Docker (absent): tests ran with a stubbed `chromadb`. (3) The replay design changed twice after the batch found the history too short and the first onset already inside the haze.
- **Diagnosed:** the map rendered black because (a) MapLibre 6's worker is a separate ES module Turbopack doesn't emit ("Worker failed to load") and (b) maplibre-gl.css sets `position: relative` on its container, overriding `absolute inset-0` and collapsing it to 0 px height. `next build` failed with "Cannot find module for page: /twin" because another session's `next dev` shared `.next`.
- **Verified:** `tsc` clean; `vitest` 72 passed; `next build` 17 routes; live `/api/kl/snapshot` and `/api/agent` 200 with real data (Batu Muda 155, Orange, 4 guarded advisories); `/api/check` 503 without a key; puppeteer pass over all five pages with 0 errors and a rendered map; backend `pytest` 122 passed with `chromadb` stubbed. **Not verified:** any live Claude call (no key); deployment.
- **Trade-off:** testing in one batch let a blank map reach the first review; the cost was one user question ("is the simulation part of this?").
- **Noted, not changed:** another session is restyling the frontend (fonts/theme/logo); the DOE feed's one carried-over KL reading; `lib/auth.ts` still stubs a single operator for the CISE pages.
- **Known issues / next steps:** see STATUS "Next actions" (confirm A-15 before the first push; set a key and run the live Claude checks; deploy; survey).

### 2026-10-23 — Site-manager lever, survey ownership, pitch notes
- **Reported:** user: "sure, add a site manager option" (then: "if it's a feature that will help us win, build it"); "not sure who runs the survey, you decide"; "take note on the key points of this project, it's important for slides and video"; wants it hosted on Vercel from the virtual-kl GitHub repo.
- **Changed:** twin engine (`siteAction`, `SITE_COMPLIANCE`, `SITE_PROTECT`, `siteHour`, `siteManagedPct`), two presets + a custom toggle, agent rehearsal, resident interview (site-managed facts), 5 tests (84), interview/vision token limits, D-27, survey ownership and operator interviews in `guides/resident-survey.md`, new `refdocs/pitch-notes.md`, memory pointer.
- **Decided:** D-27. Survey: Lisa and Bubu run the resident form; Azim and Chan do 2–3 operator interviews (two of whose questions replace the two new assumed parameters); Harry tallies and drafts the evidence slide.
- **Verified:** unit tests, production build, browser pass (radio options, metrics, persona table, interview). **Not verified:** the survey and interviews themselves; hosted deployment (see next entry if done).

### 2026-10-23 — Stress test of the build and the idea
- **Reported:** user: "stress test this project one more time to make sure the prototype is fully ready to win", then "stress test the idea itself also".
- **Changed:** `lib/kl/agent.ts` (no-data and forecast-missing decisions say so, `dataGap` flag), `components/kl/agent-console.tsx` (data-gap note), `app/page.tsx` (headline when no reading), `app/twin/page.tsx` (guard when the series is empty), new `app/error.tsx`, `lib/kl/check.ts` (tolerant observation schema), new `lib/kl/ratelimit.ts` wired into the three model endpoints, `components/kl/kl-map.tsx` (picking radius), `components/kl/twin-view.tsx` (persona quick-pick), tests (79). New doc `refdocs/stress-test-2026-10-23.md`.
- **Diagnosed:** an outage test with all upstream fetches blocked and a cold cache showed a false "Green"; a browser upload test showed the 502 the direct API test missed (the model returned 7 observations).
- **Verified:** see the stress-test doc. **Not verified:** real-GPU frame rate, hosted behaviour, Bahasa Malaysia quality.
- **Idea-level findings:** effect ≈10% and robust in ordering; lead time beyond ~1 h adds little; outdoor workers barely helped (suggested SDP site-manager lever); no resident/operator validation yet; delivery channel assumed.

### 2026-10-22 — Live Claude verification (agent, interview, photo check)
- **Reported:** user put a real Anthropic key in `frontend/.env.local` (first attempt left the literal placeholder, which gave 401 "Invalid bearer token").
- **Changed:** `lib/kl/agent.ts` (max tokens 1800 → 4096, schema accepts a bare advisory list as well as `{advisories: [...]}`, SYSTEM prompt states the exact output shape), `tests/agent.test.ts` (two regression tests; 73 total). STATUS, README, env guide, CLAUDE.md and PRD status lines updated.
- **Diagnosed:** the first live agent run failed JSON parsing because the reply was cut off at the token limit; the second because the model returned a top-level array. Neither could appear with the fake client.
- **Verified:** `/api/agent` 200 in about 15 s, `llm: claude`, 4 advisories, guardrails all true, Orange needs-approval; `/api/twin/interview` `source: claude`; `/api/check` on a Wikimedia Commons hazy KL photo: haze/poor/0.88 → corroborated (Cheras API 114, 5.8 km); on a clear skyline: none/good → unverified. **Not verified:** output quality at scale, Bahasa Malaysia fluency by a native reader, flood/fire photos.

### 2026-10-22 — Research: predictive models & algorithms for a competitive edge
- **Changed:** Added `refdocs/research-predictive-models-2026-10-22.md` (14 ranked candidates, core five detailed, sources). No code, PRD or plan changed.
- **Decided:** nothing — candidates only; the brainstorm is still open, so no ADRs were written.
- **Deviations:** none.
- **Verified:** nothing verified this session (desk research only; several papers read at abstract level, flagged in §5 of the doc).
- **Known issues / next steps:** no open historical JPS rainfall/water-level series found, so the flash-flood model needs our own archive from P1 onwards. If the team adopts any candidate, record it as an ADR and update the PRD.

### 2026-10-22 — Project scaffolded (Virtual KL on top of CISE)
- **Changed:** Created the project doc system — `refdocs/` (PRD, STATUS, sources, brainstorm, guides/ incl. resident survey, changelog/DECISIONS, plans/, execution/), `CLAUDE.md`, new `README.md`, `.claude/` (settings, secret-guard hook, agents, commands, memory/preflight). Moved the inherited CISE README verbatim to `refdocs/cise-fyp-readme.md` (`git mv`). Appended to `.gitignore` and `.env.example`. Outside the repo, consolidated loose context into `../context/` (hackathon notes + slides, team chat screenshots, original zip). No application code changed.
- **Decided:** D-01–D-17 (see `DECISIONS.md`): build on CISE; People → Safety & Security; product "Virtual KL" with the KL Twin sandbox as its headline feature; KL-first scope; Anthropic-only LLM; free data tiers; autonomy ladder; persona-policy population; simulated-means-labelled; Chronos forecasting; reuse of online code with notices kept; KL data sources; resident survey; push to `main`; context outside the repo; deliverables recorded, not planned around.
- **Deviations:** none — first session.
- **Verified:** `python -m pytest -q` → did not run (`ModuleNotFoundError: No module named 'asyncpg'`). Live probes of MET warnings/forecast, JPS flood stations, Haze Monitor (DOE), Open-Meteo air quality all returned data (details in STATUS ledger). Secret-guard hook fired against planted and clean inputs (see STATUS).
- **Noted, not changed:** dangling Firebase imports in the frontend, dead Gemini `lib/model.ts`, `eslint` missing from devDependencies, two lockfiles, hardcoded Neo4j dev password — all listed in STATUS Known gaps and P0.
- **Known issues / next steps:** 13 open assumptions (A-01–A-13), notably Melawati's KL status and the organisers' reuse permission. Next session starts from `refdocs/plans/2026-10-22-p0-foundation.md`.

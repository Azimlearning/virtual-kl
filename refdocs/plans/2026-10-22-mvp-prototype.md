# Plan — MVP prototype (demo link + demo video)

> Supersedes the ordering in PRD §6 for the current submission (D-18): P0 Foundation, P1 KL Pulse, a thin slice of P2 (agent) and P3 (sandbox), and P4's photo check are built together as one prototype. Execution doc: `refdocs/execution/2026-10-22-mvp-prototype.md`.
> A plan says **what and why**. The execution doc says **how and in what order**. Keep them separate — when they merge, both stop being read.

## Why this exists

The hackathon needs a prototype or MVP, a **demo link** and a **demo video** (key notes §1). A prototype only convinces if it runs on a public URL without a laptop full of Docker containers, shows *real* Kuala Lumpur data (the haze is happening now), and has a headline moment. The CISE stack (Postgres + Chroma + Neo4j + FastAPI) can't be hosted on free tiers (D-07), so the MVP is a self-contained Next.js app (D-18). The CISE backend stays in the repo as the engine for the roadmap.

Scope is the state of **Kuala Lumpur** (the Federal Territory) as a whole, with SDP's KL developments (KL East / Desa Melawati, KLGCC) as featured focus areas (D-04 revised). Not Malaysia, not Singapore-scale.

## What's already covered (no work needed)

- A Next.js 16 app shell, Tailwind 4 theme, shadcn/base-ui components, Recharts, theme toggle (`frontend/`)
- The CISE engine (`app/`): kept as is, documented in `refdocs/cise-fyp-readme.md`; one change only — its LLM client moves to Anthropic (D-06) so the repo has a single LLM story
- Verified live KL data sources (STATUS ledger): DOE stations via Haze Monitor, MET forecast/warnings, Open-Meteo AQ + WeatherNext ensemble, JPS stations (stale), OSM coordinates (KL East Mall, Desa Melawati, KLGCC), OpenFreeMap 3D buildings

## Scope

**In (the demo story: *see → anticipate → rehearse → verify*):**
1. **KL Pulse (`/`)** — 3D map of KL: DOE stations as columns sized/coloured by API, SDP developments marked, haze veil, JPS flood stations as a greyed "stale" layer; live status cards with data freshness; 48-hour forecast chart (model + bias-adjusted); MET forecast and warnings for KL.
2. **Proactive agent (`/agent`)** — Watch → Anticipate → Simulate → Decide → Act as a visible run. Rule-based policy from the MOE thresholds; Claude writes complete EN/BM advisories per persona group; guardrails check them; autonomy ladder: Green auto, Orange/Red wait in an approval queue.
3. **KL Twin sandbox (`/twin`, headline)** — 3D twin with ~3,000 synthetic residents around a chosen focus area; haze scenario from the live forecast *or* a replay of the real October haze; interventions (warning lead time, message quality); side-by-side outcome comparison; time scrubber; click a resident → "interview" (Claude in character, labelled simulated).
4. **Photo check (`/check`)** — upload a photo; Claude vision extracts hazard and visibility; code compares with the nearest DOE reading and returns corroborated / contradicted / unverified with reasons. Needs a key; no fake verdicts without one.
5. **Methods & limits (`/about`)** — sources, freshness, what is simulated, known limits (honesty page for judges).
6. **Foundation fixes** — frontend builds; Firebase/Gemini remnants removed; the CISE overview moves to `/engine`; backend LLM client on Anthropic.
7. **Deploy-ready** — builds for Vercel (free), env documented, graceful behaviour without an Anthropic key (templated text clearly labelled "template").

**Out (and why):**
- Chronos forecasting — needs PyTorch; a free serverless host can't run it. The MVP forecasts with Open-Meteo CAMS (+ bias adjustment) and uses the WeatherNext ensemble for rain probability. Chronos stays roadmap (D-19).
- Real alert delivery (Telegram/email) from the MVP app — CISE has it in the backend; the MVP's approval queue shows what *would* be sent and says so.
- Groundsource flood memory (667 MB), news digestion, AlphaEarth — roadmap.
- Flood simulation in the twin — JPS data is frozen at 2024-02-23 and there is no terrain model; flood stays roadmap rather than being faked (D-10, D-22).
- Survey-calibrated personas — the survey hasn't run; personas ship as clearly labelled illustrative defaults (D-23).
- Persistence/auth — the demo is stateless; the approval queue lives in the browser.
- Actually deploying — needs the team's Vercel login and consent; config is ready (D-21).

## Approach

- **One app, server routes.** All external calls (data sources, Anthropic) happen in Next.js route handlers/server code; the browser only calls our own `/api/*`. Keys stay server-side.
- **Pure-logic core.** Scoring, policy, guardrails, the population engine and the corroboration logic are pure TypeScript modules with unit tests; network and LLM sit behind thin wrappers that tests mock.
- **Fallbacks that are labelled.** No key → templated advisories/interviews flagged `source: "template"`; a failed data source → its card shows "unavailable" with the error, never a guess.
- **Haze first.** It is live and verified; thresholds come from the MOE statement. Forecast is model US AQI shifted by the current gap to DOE's API, labelled indicative.
- **Residents are illustrative.** Positions scatter around a focus area (not real addresses); persona parameters are illustrative defaults pending the survey; everything simulated carries a visible label.
- **Visuals:** deck.gl layers over a MapLibre map (OpenFreeMap 3D buildings): extruded station columns, ~3,000 animated resident dots, haze veil whose opacity follows AQI, camera flights between focus areas.

## Risks & unknowns

| Risk / unknown | Confidence | Mitigation |
|---|---|---|
| deck.gl + MapLibre integration under Next 16/React 19 | Medium — imperative use in an effect, not yet built | Dynamic import, client-only; headless screenshot check |
| Anthropic SDK details for the pinned version | Medium — vision/messages shape confirmed in docs; model ids from the session environment | Single wrapper `lib/kl/llm.ts`; unit test with a fake client |
| No Anthropic key in this environment | Known | LLM paths tested with mocks; live check is a documented manual step for the team |
| Third-party data (Haze Monitor) outage or schema change | Medium | Zod-validate; per-source `ok/error/freshness`; UI degrades per card |
| Model US AQI ≠ DOE API | Known | Show both, show the gap, label forecast "indicative" |
| Persona numbers look authoritative but aren't | High if unlabelled | Label in UI and `/about`; `calibration: "illustrative"` in every result |
| OpenFreeMap availability / attribution | Low risk | Keep attribution; style URL in one constant |
| Free-tier limits (Open-Meteo, Nominatim) | Low | Cache with `revalidate`; no Nominatim calls at runtime (coordinates are baked in with sources) |
| Build or type errors surface late (testing is batched) | Medium | Strict TypeScript, small modules, one big test pass at the end per the user's instruction |

## Definition of done

Every line is true and *observed*:

- `npm run build` succeeds in `frontend/`; `npx tsc --noEmit` is clean; the unit-test suite passes (counts recorded in STATUS).
- With no Anthropic key, every page loads and shows real DOE/MET/Open-Meteo data; the agent and twin run with templated text labelled as such; `/check` says it needs a key.
- A headless-browser screenshot of `/` and `/twin` shows the 3D map with the layers (checked by eye).
- With the production build running (`npm start`), `GET /api/kl/snapshot` returns KL data with per-source freshness; `POST /api/agent` returns steps, advisories, and guardrail results.
- The twin's engine is deterministic for a given seed (tested) and the baseline-vs-warning comparison shows an improvement only when the parameters imply one (tested).
- Backend: `python -m pytest` result recorded (pass or fail, verbatim) after the Anthropic swap.
- Docs (PRD, STATUS, DECISIONS, CHANGELOG, env guide) reflect what was built, with unfinished items in Known gaps.

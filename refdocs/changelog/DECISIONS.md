# Architectural Decisions — Virtual KL

> Record decisions here so they aren't re-debated in future sessions.
> Format: **Decision** → **Why** → **Trade-offs / what was rejected**.
> Canonical one-line list lives in `refdocs/virtual-kl-PRD.md` §7; this file expands the load-bearing ones under the same id.

An ADR is worth writing when the decision (a) is expensive to reverse, (b) will look arbitrary to a future reader, or (c) had a real alternative someone will propose again. Everything else is just a commit message.

---

### D-01 — Build on CISE and disclose it as background IP (2026-10-22)
- **Decision:** Virtual KL is built on top of CISE (Lisa's FYP: ingestion, Postgres, Chroma + Neo4j, RAG with three guardrails, alerts, human review, reports, Next.js UI). CISE is disclosed as background IP in the submission.
- **Why:** The team chose "FYP Lisa" in its poll (4 votes vs 1 for Jie Hao's FYP, 0 for a new project). It already solves the plumbing the hub needs.
- **Trade-offs / rejected:** A new project from scratch (no votes; no time advantage). Jie Hao's FYP (one vote). T&C cl.12 grants SDP a licence to background IP as needed — Lisa has agreed to proceed and keeps her FYP in local files.

### D-02 — Track: People → Safety & Security (2026-10-22)
- **Decision:** Submit under People, focus area Safety & Security.
- **Why:** The problem is residents' access to timely, trusted, actionable safety information. Jie Hao framed safety as "more than break-ins — it includes the unexpected, like climate crises".
- **Trade-offs / rejected:** Planet → Climate Resilience (same engine, but Planet's examples centre on behaviour change and green infrastructure; Jie Hao felt it implied hardware). People → Mobility (live 3D bus tracking: data.gov.my GTFS-realtime offers vehicle positions only, and it is mostly new code). Corporate risk ops (the Petronas use case) is a pitch-only scalability story.

### D-03 — Product "Virtual KL": hub first, KL Twin sandbox as the headline feature (2026-10-22)
- **Decision:** The product is a resilience hub. The KL Twin sandbox (physical twin + synthetic residents + decision sandbox) is its headline feature, not a separate product.
- **Why:** User choice ("the hero is the feature inside the hub"). The hub gives the sandbox live data and a reason to exist; the sandbox gives the hub its differentiation and visual impact.
- **Trade-offs / rejected:** Sandbox-as-product (bigger build, weaker day-to-day value for residents). The working name "Siaga" was dropped by the user.

### D-04 — Kuala Lumpur first (2026-10-22)
- **Decision:** Scope is SDP's KL developments — KL East, Melawati, KLGCC Resort (see A-01). Klang Valley townships (e.g. Bandar Bukit Raja, Putra Heights, Elmina) and the rest of SDP's 28 developments are roadmap.
- **Why:** User instruction: "scope it out to KL first, not virtual Malaysia". Depth over breadth.
- **Trade-offs / rejected:** A nationwide twin. Note the strongest documented SDP flood case (Bandar Bukit Raja) is outside KL; it stays a pitch example, not a build target.

- **Revised (2026-10-22, later):** the unit is the **whole Federal Territory of Kuala Lumpur** ("just a state, which is the state of Kuala Lumpur"), not only SDP's developments. KL East, Melawati and KLGCC Resort remain the featured focus areas (amber rings on the map); DOE stations, MET district forecasts and the 3D twin cover KL as a whole. Coordinates are sourced (OSM Nominatim 2026-10-22 / DOE station metadata) — see `frontend/lib/kl/geo.ts`.

### D-05 — Users and surfaces (2026-10-22)
- **Decision:** Residents use a public, no-login page (primary surface). Township operators use the console (review, approval queue, sandbox Rehearse mode). SDP planners use sandbox Plan mode.
- **Why:** The user delegated the primary-user call and said the sandbox serves both operators and planners. The problem statement is about residents.
- **Trade-offs / rejected:** Operator-first (keeps CISE's analyst shape, misses the resident problem). Both equal (more to build).

### D-06 — Anthropic API is the only LLM (2026-10-22)
- **Decision:** Every model call goes through `app/intelligence/llm_client.py` to the Anthropic API, server-side. Default model `claude-sonnet-5-5`; high-volume tasks (translation, persona interviews) may use `claude-haiku-5-5` (ids to verify, A-05). Ollama is removed in P0; the dead Gemini file `frontend/lib/model.ts` is deleted.
- **Why:** User instruction ("we will use cloud for all, basically Anthropic API key"). A cloud model makes a hosted demo possible and enables vision, tool use and structured outputs.
- **Trade-offs / rejected:** Hybrid local + cloud; local-only (CISE's original privacy commitment — this supersedes it for the hackathon build). Cost becomes a variable to watch.

### D-07 — Free data tiers + Anthropic only (2026-10-22)
- **Decision:** All data sources must be free. The only paid item is the Anthropic API.
- **Why:** User choice.
- **Trade-offs / rejected:** Paid hosting/DB. Note free tiers with non-commercial terms (Open-Meteo, GNews, Cesium community, Earth Engine) are fine for the hackathon but would need paid plans for a commercial pilot (A-10).

### D-08 — Autonomy ladder for the proactive agent (2026-10-22)
- **Decision:** L1 threshold alert → L2 forecast alert → L3 agent-drafted action → L4 agent-sent action. L4 only for low-risk advisories. Orange-and-above actions wait in an approval queue. Red is never auto-sent. Every action is written to the audit log.
- **Why:** Trust and safety; research shows false alarms erode trust in warnings. Keeps CISE's human-in-the-loop design.
- **Trade-offs / rejected:** Fully autonomous sending (more impressive, unsafe). Always-manual (loses the proactive story).

### D-09 — Synthetic population architecture (2026-10-22)
- **Decision:** Claude generates ~10 persona decision policies (structured, versioned, calibrated by D-14). A deterministic rule engine runs thousands of agents in the browser or backend. Claude is called only to generate policies, answer "interview" questions, and narrate outcomes.
- **Why:** LLM-per-agent-per-tick is too expensive at thousands of agents. AgentSociety 2 cuts LLM calls 66.5% with pre-generation and caching; LLM-agent evacuation studies show demographic-conditioned agents track real behaviour (ρ 0.58 zero-shot, 0.79 fine-tuned).
- **Trade-offs / rejected:** Full generative agents per resident (cost, latency). Pure rule-based personas without an LLM (loses the interview demo and quick persona authoring).

### D-10 — Simulated means labelled (2026-10-22)
- **Decision:** Sandbox outcomes, synthetic residents, interviews and flood-depth layers are labelled as simulated or illustrative in the UI and in API payloads (`simulated: true`).
- **Why:** Honesty, and judges score evidence. A simulation is a planning tool, not proof of real-world effect.
- **Trade-offs / rejected:** Unlabelled realism (looks better, misleads).

### D-11 — Forecasting with Chronos (2026-10-22)
- **Decision:** Use Chronos (Chronos-Bolt or Chronos-2, Apache-2.0) zero-shot on CPU for API (air)/PM2.5 and temperature per development, backtested against a persistence baseline. AI weather probabilities come from the WeatherNext 2 ensemble via Open-Meteo.
- **Why:** Pretrained time-series models beat classical baselines zero-shot on air quality (AtmoBench). No training needed. Chronos-2 accepts covariates (wind) for haze.
- **Trade-offs / rejected:** TimesFM 3.0 (strong, but weights non-commercial and heavier). Microsoft Aurora (beats or matches CAMS on air pollution, but needs a GPU and gridded inputs — roadmap). Google flash-flood API (waitlist, "may take months" — roadmap).

- **Update (2026-10-22, later):** no StadiView code was copied; the twin is built on MapLibre + deck.gl (D-24). StadiView remains a visual/interaction reference only. The reuse permission (A-11) is still unconfirmed in writing.

### D-12 — 3D stack and reuse of online code (2026-10-22)
- **Decision:** The KL Twin uses deck.gl and/or Three.js (both MIT). Online code and assets may be reused, including StadiView (thebuggeddev/football-stadium: procedural Three.js scene, instanced thousands of selectable objects, GSAP camera flights, first-person view). Every reused file keeps its licence notice and gets a row in `THIRD_PARTY_NOTICES.md`.
- **Why:** User instruction: the team asked the organisers, who said SDP would only use submissions as inspiration and build their own.
- **Trade-offs / rejected:** Inspiration-only reuse (the original recommendation, given StadiView's PolyForm Noncommercial licence). **Residual risk:** that licence is between us and StadiView's author, and the written T&C (cl.10, cl.14) still require lawfully licensed third-party material — see A-11. Prefer permissive sources when two options are equal.

- **Update (2026-10-22, later):** JPS `flood-warning` is reachable but **frozen at 2024-02-23** (D-22). The DOE feed carries one KL station (Cheras) as a carried-over reading at times; this is shown as a note, not as staleness.

### D-13 — KL Pulse data sources (2026-10-22)
- **Decision:** DOE station readings via Haze Monitor's free JSON API; MET warnings and district forecasts via `api.data.gov.my/weather/*`; JPS water-level stations via `api.data.gov.my/flood-warning` (redirect — use follow-redirects); Open-Meteo air quality, forecast, flood (GloFAS) and ensemble (WeatherNext 2); Groundsource (Zenodo, CC BY 4.0). CISE's global feeds stay, behind a KL relevance filter.
- **Why:** All free; all returned live data on 2026-10-22 (probes recorded in the changelog).
- **Trade-offs / rejected:** Scraping DOE's JS-rendered APIMS page directly (the legacy host returns 403). MET's own keyed API (data.gov.my mirrors it without a key). PurpleAir (points-based paid API).

### D-14 — Resident survey to calibrate personas (2026-10-22)
- **Decision:** The team runs a short, anonymous resident survey (`refdocs/guides/resident-survey.md`). Its answers set persona parameters. If no survey data exists, personas use literature defaults and are labelled as such.
- **Why:** The user delegated the call. Survey alignment is what made LLM agents credible in the literature, and the hackathon asks teams to validate with residents.
- **Trade-offs / rejected:** No survey (personas become guesswork). Interviews only (fewer data points).

### D-15 — Commit and push straight to `main` (2026-10-22)
- **Decision:** No feature branches; commit to `main` and push to `origin main`. Never force-push.
- **Why:** User instruction: the repo exists only for this project.
- **Trade-offs / rejected:** A `hackathon` branch to protect the FYP lineage (unnecessary — Lisa keeps her FYP in local files).

- **Update (2026-10-22, later):** `origin` is now `https://github.com/Azimlearning/virtual-kl.git` (new, **public**, empty at the time). Lisa's repo is kept as the local remote `lisa-fyp`. **Nothing has been pushed**: pushing would publish Lisa's FYP code and commit history publicly, so it needs her and the team's confirmation first (see D-15 and PRD §8).

### D-16 — Context material stays outside the repo (2026-10-22)
- **Decision:** Hackathon notes, briefing slides, the team chat screenshots and the original zip live in `../context/` (sibling of the repo), never in git.
- **Why:** The screenshots contain names and email addresses; the slides are SDP programme materials (T&C cl.8). The repo is private but its link goes to judges.
- **Trade-offs / rejected:** Committing context for convenience.

### D-17 — Record deliverables, don't plan around them (2026-10-22)
- **Decision:** The PRD records what the hackathon requires; plans never cut scope or reorder phases because of the deadline.
- **Why:** User instruction: "me and the team will worry about deliverables and timing".
- **Trade-offs / rejected:** Deadline-driven scoping.

### D-18 — MVP architecture: a standalone Next.js app (2026-10-22)
- **Decision:** The submission prototype is one Next.js 16 app (`frontend/`). Server route handlers and server components call the data sources and the Anthropic API; the browser only calls our own `/api/*`. The CISE engine (`app/`: FastAPI + Postgres + Chroma + Neo4j) stays in the repo as the roadmap engine and is not required to run the demo.
- **Why:** The user asked for a prototype/MVP with a **demo link and a demo video**. Postgres + Chroma + Neo4j can't be hosted on free tiers (D-07). A single Next.js app deploys to Vercel's free tier and runs with `npm run dev`.
- **Trade-offs / rejected:** Deploying the full stack (cost, ops). Rewriting CISE features in TypeScript (the MVP re-implements only what the demo needs: scoring, policy, guardrails, agent loop, twin). Telegram/email delivery, persistence and the CISE review queue are not part of the MVP. The CISE pages (`/engine`, `/incidents`, `/alerts`, `/reports`, `/activity`) are hidden unless `NEXT_PUBLIC_ENGINE_ENABLED=true` and `API_BASE_URL` points at a running backend.

### D-19 — MVP forecasting: CAMS model + bias adjustment; Chronos deferred (2026-10-22)
- **Decision:** The MVP forecasts haze with Open-Meteo's Copernicus CAMS model (US AQI scale), shifted by the current gap to DOE's API and tapering to zero over 48 h; rain probability comes from the 64-member WeatherNext 2 ensemble. Chronos (D-11) is deferred.
- **Why:** Chronos needs PyTorch, which a free serverless host can't run. The bias adjustment is a labelled heuristic ("indicative, not official") and on 2026-10-22 the model agreed with DOE within 1 point (156 vs 155).
- **Trade-offs / rejected:** Shipping Chronos on a laptop only (breaks the demo link). Presenting model US AQI as if it were the Malaysian API (they differ; both are shown). No backtest exists yet — it is listed as a gap, not claimed.

### D-20 — Build first, verify in one batch (2026-10-22)
- **Decision:** For the MVP, implement all tasks first and run one combined verification batch (type check, unit tests, production build, live endpoints, real-browser screenshots, backend pytest), instead of testing after every component.
- **Why:** User instruction: "run testing in bunches or in big amounts". The batch found real defects (MapLibre worker not loading, container CSS collapsing the map to 300 px, a replay window that started inside the haze, ambiguous "8 PM" labels, a latent CISE type error hidden by `ignoreBuildErrors`), all fixed and re-verified.
- **Trade-offs / rejected:** Per-component testing (slower feedback on the user's priorities, but would have caught the map bug earlier — the cost of batching).

### D-21 — Demo link: Vercel free tier, not deployed yet (2026-10-22)
- **Decision:** The app is deploy-ready for Vercel (root `frontend/`, env `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`). It has **not been deployed**.
- **Why:** Deploying publishes under the team's account and needs a login and consent; the Vercel connector in this environment also needs authorisation. Without a key the deployed app still works (labelled templates), but the photo check says it needs a key.
- **Trade-offs / rejected:** Deploying on the user's behalf unasked. A local-only demo (still works: `npm run dev`).

### D-22 — JPS flood data is frozen: show it, never use it (2026-10-22)
- **Decision:** The 58 JPS water-level stations in KL are drawn as a greyed, clearly labelled "stale" map layer. They are never used for decisions, scoring or simulation. Flooding is not forecast or simulated in the MVP.
- **Why:** The data.gov.my feed returns `water_level_update_datetime` = 2024-02-23 for every KL station (972 days old). Simulating floods without terrain data or a live sensor would be invented realism (D-10).
- **Trade-offs / rejected:** Hiding the layer (loses the honest "here is what's missing" story). Using it as if current (wrong and dangerous). Re-check the feed periodically; if it becomes live, add it as a real input.

### D-23 — Persona parameters are illustrative defaults (2026-10-22)
- **Decision:** The eight personas' shares, outdoor-hour curves, channel mixes, trust/action/protection values and the delivery/ambient reach probabilities are **illustrative defaults**, labelled as such in the UI, the API (`calibration: "illustrative"`) and `/about`. The resident survey (`refdocs/guides/resident-survey.md`) is the planned replacement.
- **Why:** No survey data exists yet (A-08). Labelling beats false precision (D-10); the sandbox shows how timing and message quality interact, not real effect sizes.
- **Trade-offs / rejected:** Quoting literature numbers as if they were KL numbers (not verified for this population).

### D-24 — 3D stack: MapLibre + deck.gl over OpenFreeMap (2026-10-22)
- **Decision:** The twin and Pulse maps use MapLibre GL 6 with OpenFreeMap's `liberty` vector style (3D buildings, free, no key) and deck.gl layers (DOE columns, focus rings, resident dots with animated positions). The MapLibre worker file is copied into `public/maplibre/` before dev/build (`scripts/copy-maplibre-worker.mjs`, git-ignored). A CSS filter gives a dark basemap in dark mode. The Pulse map slowly rotates until touched.
- **Why:** Verified working in a real browser. Google Photorealistic 3D Tiles need a billing account and unverified KL coverage (A-04), so they were not used.
- **Trade-offs / rejected:** Google 3D Tiles/Cesium (cost, quota). A flat 2D map (loses the "virtual city" feel). Residents are positioned illustratively (scattered around a focus area, commuting toward a destination), not on real buildings.

### D-25 — No key means labelled templates, never fake AI (2026-10-22)
- **Decision:** Without `ANTHROPIC_API_KEY`, advisories and resident interviews fall back to deterministic templates labelled `source: "template"`; the photo check returns 503 with a message, because it has no honest fallback. Model advisories that fail the guardrails are replaced by templates and the run says so.
- **Why:** No key exists in the build environment, so all model paths were tested with a fake client (65+ unit tests); live Claude output is **unverified** until the team sets a key.
- **Trade-offs / rejected:** Canned "AI" output presented as live; hiding the fallback.

### D-26 — Verification builds use their own output folder (2026-10-22)
- **Decision:** `next.config.mjs` honours `NEXT_DIST_DIR`; verification builds use `NEXT_DIST_DIR=.next-verify` (git-ignored via `.next-*/`).
- **Why:** Other sessions run `next dev` in the same `frontend/` folder; a dev server and a production build share `.next` and clobbered each other ("Cannot find module for page: /twin").
- **Trade-offs / rejected:** Stopping other sessions' dev servers.

### D-27 — Site-manager action is a first-class lever in the sandbox (2026-10-23)
- **Decision:** An intervention may also notify site managers / employers (`siteAction`). In the twin, a share of outdoor-worker crews (`SITE_COMPLIANCE` 0.6) have heavy outdoor work rescheduled and work-rest cycles added one hour after the notification, cutting their residual exposure to `SITE_PROTECT` 0.4. Two presets (site-manager action only; complete 6 h advisory + site-manager action), a custom toggle, the agent's rehearsal and the resident interview all know about it.
- **Why:** The stress test (`refdocs/stress-test-2026-10-23.md`) found outdoor workers are the most exposed group (8.8 h) and the least helped by a resident warning (3%). SDP is a developer, so its construction sites and contractors are exactly those workers and a lever SDP itself controls. It is also what separates Virtual KL from the national alert channels (APIMS, NADMA SMS, planned cell broadcast), which cannot tell a site manager to reschedule work.
- **Result (replay, KL East, illustrative parameters):** outdoor-worker exposure −30% with site action alone vs −3% with a warning alone; −35% combined. Whole population: −6.2% site-only, −10.1% warning, −16.7% both. Across compliance 0.3–0.9 and protection 0.25–0.6 the worker gain ranges 12–68%, always above the warning-only 3%, so the direction is robust and the size is not.
- **Trade-offs / rejected:** The two parameters are assumptions like every persona parameter (D-23) and are labelled that way; the operator interviews in the survey guide exist to replace them. Rejected: modelling employers individually (no data).

### D-28 — The twin is the product; the agent acts first (2026-10-23)
- **Decision:** (1) The home page `/` is the KL Twin: a tall map of simulated residents with the real haze replaying and auto-playing on arrival. The old Pulse page moved to `/live` ("Live data"); `/twin` redirects to `/`. (2) The agent is proactive, not a button. It starts when the app opens, re-checks Kuala Lumpur every minute while a tab is open, and by itself: notices level changes, sudden jumps, a forecast crossing of 100 within 24 h and feed outages; rehearses all seven options on the twin and picks one (shown as "Agent's pick" and pre-selected, the human can override); drafts the bilingual advisories through Claude at Orange/Red once per level per day; and files all of it in a feed (right column on `/`, floating dock elsewhere, toasts, optional desktop notifications). It asks the human only for decisions that are theirs: show/apply the plan, approve the advisories. While the replay plays, the agent narrates what it is doing ("sends the advisory", "site managers notified", "AQI crosses 100").
- **Why:** "Proactive" means taking initiative, not waiting to be run (the reactive vs proactive argument the user raised); a judge should see the agent do something unprompted within seconds of opening the app. The simulation is what makes the product distinctive, so it should be the first thing seen.
- **How:** `lib/kl/proactive.ts` (pure, 12 tests: observe, recommend, draft initiative), `components/kl/agent-provider.tsx` (loop, toasts, session storage), `components/kl/agent-feed.tsx` (feed, status line, dock), `components/kl/twin-view.tsx` (pick, narration, auto-play, proposals). Initiative text is deterministic and grounded in the snapshot; only advisory drafting uses the model.
- **Trade-offs / rejected:** It runs only while a tab is open (a hosted scheduler needs storage and a paid cron on Vercel; the CISE engine already has workers, which is the roadmap). State is per browser session on purpose, so every session starts with the agent introducing itself. Rejected: auto-sending anything (Red is never auto-sent; delivery is not wired); LLM-written observations (risk of ungrounded numbers for no gain).

### D-29 — A short first-run intro and tour (2026-10-23)
- **Decision:** On a browser's first visit: a three-slide welcome (what it is, the agent that acts first, what you control) and then a five-stop spotlight tour of the real controls on the home page (map, timeline, agent feed, interventions, interview). Remembered per browser in localStorage with an in-memory fallback; replayable from the "?" button in the header; Escape or Skip ends it. The page behind is inert while it shows, the agent's pop-ups wait, and reduced-motion users get the pictures without delays.
- **Why:** This is a demo app that judges open cold. The home page now has a lot going on (map, agent feed, controls); a 20-second guided start tells them where to look. Pattern and the faults to avoid follow `onboarding-intro-and-tour.md` from another project, simplified (no per-user keys, no sign-in).
- **Trade-offs / rejected:** Anyone recording the demo sees it once per browser; press Escape or use a fresh profile after the first run, or replay on purpose. A tour library was rejected (about 400 lines by hand, follows our tokens).

---

## Working assumptions (`ASSUMED:`)

Not decisions — guesses made to keep moving. Each one must be confirmed or killed before anything load-bearing is built on it. When one is resolved, delete it here and write a real ADR above.

- **A-01** ASSUMED: SDP's "Melawati" belongs in the KL focus set. The briefing deck [s8] lists it under Kuala Lumpur; SDP's annual report lists "Melawati, Ampang Jaya" (Selangor). The map uses OSM's Desa Melawati (KL) as an approximate point.
- **A-02** ASSUMED: KL East is the hero development (default focus of the twin and the agent rehearsal).
- **A-05** VERIFIED 2026-10-22: `claude-sonnet-5-5` works for agent text, interview and vision with a real key. `claude-haiku-5-5` is still unexercised.
- **A-06** ASSUMED: Haze Monitor's free third-party API stays available. Verified on 2026-10-22: 68 DOE stations, 2 in Kuala Lumpur; one carried over from the previous hour at times.
- **A-08** ASSUMED: the team can run the anonymous resident survey.
- **A-10** ASSUMED: non-commercial free tiers (Open-Meteo, GNews) are acceptable for the hackathon; a paid pilot needs paid plans.
- **A-11** ASSUMED: organisers allow reuse of any online resources — conflicts with written T&C cl.10/cl.14; get it in writing.
- **A-13** ASSUMED: Groundsource has flood events overlapping KL (not queried; flood memory is not in the MVP).
- **A-14** ASSUMED: the app deploys cleanly to Vercel's free tier with root `frontend/` (not attempted; needs the team's login).
- **A-15** ASSUMED: it is acceptable to push this repository publicly, including Lisa's FYP code and commit history. Needs Lisa's and the team's confirmation (and her supervisor's, if FYP similarity checks apply) before the first push.

Resolved on 2026-10-22: A-03 (focus-area coordinates sourced from OSM/DOE, cited in code), A-04 (Google 3D Tiles not used, D-24), A-07 (JPS frozen, D-22), A-09 (Chronos deferred, D-19), A-12 (name confirmed as "Virtual KL" by the user's repo and folder name).

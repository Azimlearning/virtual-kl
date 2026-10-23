# Virtual KL — Product Requirements Document (PRD)

> Virtual KL is a township resilience hub for Sime Darby Property's Kuala Lumpur developments. It fuses live haze, weather, flood and incident data per development, runs a **proactive AI agent** that warns residents *before* conditions cross safety thresholds, and contains a **KL Twin sandbox** — a 3D digital twin with a synthetic resident population — where township operators rehearse tonight's warning and SDP planners test design what-ifs. It is the team's entry to the SDP University Hackathon 2026 (People → Safety & Security), built on CISE, the crisis-intelligence engine from Lisa's final-year project.

- **Owner:** Azim (dev lead), with Lisa (CISE author), Por Jie Hao, Harry and Nur Farah (ideas, research, validation)
- **Users:** KL township residents (public, no login) · township operators (SDP community management) · SDP planners
- **Status:** MVP prototype built 2026-10-22 (demo link not yet deployed, D-21). Verified: 72 frontend unit tests, 122 backend tests, production build, live endpoints, real-browser check. Model (Claude) paths are untested live: no API key in the build environment (D-25).
- **Last updated:** 2026-10-22
- **Source of record:** [virtual-kl-sources.md](virtual-kl-sources.md)
- **Founding context:** [brainstorm-2026-10-22.md](brainstorm-2026-10-22.md) (concept + research), [cise-fyp-readme.md](cise-fyp-readme.md) (inherited engineering log), and outside the repo: `../context/hackathon/SDP_Hackathon_Key_Notes.md`, `../context/hackathon/SDP_University_Hackathon_2026.md`, `../context/team-chat-2026-10-22/` (22 screenshots of the team's planning chat — kept out of git, they contain personal details)

---

## 0. The problem (one problem, stated once)

**Residents of SDP townships don't get timely, specific, trusted information about what a hazard means for *their* street and what to do — and township operators can't see in advance who will be affected or rehearse how to warn them.**

Evidence (sources in `brainstorm-2026-10-22.md`):
- Putra Heights pipeline fire (Apr 2025): residents said they had "no main channel" for updates and set up their own chat group.
- Bandar Bukit Raja (an SDP township): recurring flash floods since Dec 2021; SDP's MD called it "a top priority" (Nov 2024).
- Taman Sri Muda flood study (2026): residents learned from neighbours/WhatsApp; SMS lacked depth, roads, routes; sirens were "uninterpretable" and eroded trust.
- Right now (Oct 2026): a very strong El Niño, haze closing schools at API > 200 in Selangor, and MET warning of extreme heat from Jan–May 2027.

Virtual KL starts in Kuala Lumpur (D-04) and treats haze, heat, flash flood and local incidents through one lens: *warn earlier, more specifically, with receipts.*

---

## 1. Context & Hard Constraints

These are confirmed from the hackathon key notes, the team chat, and the user's answers during scaffolding (2026-10-22), and drive every downstream decision.

| Constraint | Value | Consequence |
|---|---|---|
| Track | People → Safety & Security (one track only, T&C) | Planet/Climate Resilience framing and Mobility are not pursued (D-02) |
| Geography | **Kuala Lumpur (the Federal Territory) as the whole unit**; SDP's KL East, Melawati and KLGCC Resort are featured focus areas (A-01) | No nationwide twin; Klang Valley and the other SDP townships are roadmap (D-04) |
| LLM | Anthropic API only, cloud, server-side | Ollama is gone from the code; the browser never calls a model — only server code does (D-06) |
| Cost | Free data tiers + Anthropic API | Any paid API/hosting needs an ADR (D-07) |
| Reuse | Online code/assets may be reused (team says organisers agreed; written T&C cl.10/14 say otherwise — A-11) | Keep licence notices + attribution in `THIRD_PARTY_NOTICES.md` (D-12) |
| IP & AI disclosure | Submissions vest in SDP (T&C cl.11); background IP disclosed (cl.12); material AI use disclosed (cl.13) | CISE disclosed as background IP; keep a running record of AI-assisted work |
| Honesty | Never fabricate data; simulated output is labelled | Synthetic residents, sandbox outcomes, illustrative flood depth carry a "simulated" label (D-10) |
| Safety | AI text reaching people passes guardrails; Orange+ needs approval; Red never auto-sent | Autonomy ladder (D-08) |
| Privacy | No personal data in the repo; resident data opt-in and minimal; survey anonymous | Context stays in `../context/` (D-16); PDPA-minded design |
| Workflow | Commit and push straight to `main` | No feature branches (D-15) |
| Hackathon deliverables (recorded only — team owns timing, D-17) | Proposal due 23 Oct 2026, 11:59 PM: pitch deck (≤10 main slides + appendix), 5-minute video or live demo link, prototype/repo link; supporting docs optional. Judging: Impact 25%, Innovation 20%, Feasibility 20%, Strategic fit 15%, Commercial 10%, Team/evidence/pitch 10%. Top 10 refine until 11 Nov; pitch 14 Nov | Docs record these; plans don't cut scope around them |

---

## 2. Product Principles

1. **Proactive over reactive.** Act on the *predicted* state ("62% chance API passes 100 by 2 PM"), not after a threshold is crossed.
2. **Receipts on everything.** Every alert, brief and sandbox result shows its sources, data freshness and confidence. Extends CISE's grounding/numeric/domain guardrails.
3. **Simulated means labelled.** A simulation is a planning tool, never evidence of what happened.
4. **Complete messages.** Every resident message says what, where, when, and what to do — the format research shows people act on.
5. **Humans approve the serious stuff.** Automation for low-risk advisories only.
6. **KL first, one problem.** Depth in three developments beats breadth across 28.

---

## 3. Architecture

**MVP architecture (D-18):** one Next.js app. The browser calls only our own `/api/*`; server code calls the data sources and the Anthropic API.

```
FREE DATA SOURCES (live-checked 2026-10-22)        VIRTUAL KL — Next.js app (frontend/)                         BROWSER PAGES
DOE API via Haze Monitor (2 KL stations) ──┐      lib/kl/sources.ts   fetch + zod validation, per-source freshness   /live    Live data: 3D map, forecast, MET
Open-Meteo CAMS air quality (21 d + 3 d) ──┤      lib/kl/snapshot.ts  bias-adjusted 48 h forecast                    /agent  Proactive agent console
Open-Meteo WeatherNext 2 ensemble (rain) ──┤      lib/kl/agent.ts     Watch → Anticipate → Simulate → Decide → Act    /       KL Twin home + proactive agent feed
MET forecast + warnings (data.gov.my) ─────┤      lib/kl/guardrails.ts numbers · level · claims · completeness        /check  Photo check (Claude vision)
JPS flood stations (FROZEN 2024-02-23) ────┘      lib/twin/*          seeded population engine, 8 personas             /about  Methods & limits
OpenFreeMap vector tiles (3D buildings) ─────────────────────────────────────────────────────────────────────────► map
                                                   ANTHROPIC API — server-side only; labelled templates when no key
CISE engine (app/: FastAPI + Postgres + Chroma + Neo4j) — kept in the repo, not required for the demo, roadmap
```

### 3.1 Components

| Component | State | Notes |
|---|---|---|
| Data layer (DOE, Open-Meteo AQ + ensemble, MET forecast/warnings, JPS) | **Built** | `frontend/lib/kl/sources.ts`; every source reports `ok / stale / error` and age |
| Scoring, policy (MOE thresholds), bias adjustment | **Built** | `scoring.ts`, `policy.ts`; Orange > 100, Red > 200 (D-08) |
| Guardrails (numbers, level, claims, completeness) | **Built** | `guardrails.ts`; model advisories that fail are replaced by templates |
| Proactive agent loop + approval queue | **Built** | `agent.ts`, `/agent`; queue lives in the browser; no delivery channel (D-18) |
| KL Twin sandbox | **Built** | 2,000–3,000 seeded residents, 8 persona types, interventions, replay of a real onset, interviews (D-09, D-23) |
| Photo check (Claude vision + DOE corroboration) | **Built, needs key** | returns 503 without `ANTHROPIC_API_KEY` (D-25) |
| Methods & limits page | **Built** | live source status table |
| LLM client (Anthropic) | **Built** in both apps | `frontend/lib/kl/llm.ts` and `app/intelligence/llm_client.py` |
| CISE engine (ingestion, Postgres, Chroma, Neo4j, RAG, alerts, reviews, reports) | Exists, optional | Python tests: 122 pass (with a stubbed `chromadb` import — see STATUS) |
| Chronos forecasting; backtest | **Not built** | deferred (D-19) |
| Groundsource flood memory; news digestion; AlphaEarth | **Not built** | roadmap |
| Real alert delivery, persistence, auth | **Not built** | CISE has them; not wired into the MVP |
| Survey calibration | **Not done** | personas are illustrative (D-23) |

### 3.2 Data & state

- **MVP: stateless.** Each request fetches live data (cached 2–30 minutes by the Next.js fetch cache). The approval queue and scenario controls are browser state.
- **CISE tables (unchanged, not used by the MVP):** `hazards`, `incident_notes`, `incident_reviews`, `audit_log`, `alert_sends`, `reports`, `hazard_links`, `hazard_context`.
- **Simulation results carry `simulated: true` and `calibration: "illustrative"` (D-10, D-23).**

---

## 4. Modules / Feature Areas

Status as of 2026-10-22. "Built" means implemented **and** covered by the verification batch (STATUS ledger); live Claude output was spot-checked once on 2026-10-22, not evaluated (D-25).

### M1 — KL Pulse — **built**
- Real DOE readings (Batu Muda, Cheras) with age; MET 7-day KL forecast and warnings; WeatherNext 2 rain probability; 48 h forecast chart (model + bias-adjusted, MOE thresholds drawn); JPS stations as a labelled stale layer; 3D map with DOE columns, SDP focus rings, haze veil, slow flyover.
- Not built: satellite/ML haze estimates between stations.

### M2 — Proactive agent — **built (templates verified; Claude text unverified)**
- Five visible steps; day-aware timing ("9 PM today", "8 PM tomorrow"); a rehearsal on the twin (lead times collapse to "now" when the haze is already under way); level decision and autonomy; four audience advisories in EN and BM; guardrail chips per advisory; approve/dismiss queue.
- Not built: Chronos, backtest, personal safety twin, real delivery.

### M3 — KL Twin sandbox (headline) — **built**
- Physical twin: OpenFreeMap 3D buildings + deck.gl layers; haze veil follows the model AQI.
- Social twin: 2,000–3,000 synthetic residents commuting around a focus area, coloured by state (unaware / informed / protected / exposed), with live counts.
- Decision sandbox: replay of a real haze onset (model values, from the last three weeks) or the live 48 h forecast; interventions (no warning, generic vs complete message, 1 / 6 / 12 h lead, custom); comparison bars, residents-over-time chart, per-persona table; time scrubber with play; click a dot to interview that resident.
- Everything is labelled simulated with illustrative parameters. Flooding is not simulated (D-22).

### M4 — Ground truth & memory — **partly built**
- Built: photo check (needs a key).
- Not built: Groundsource KL flood memory, news digestion, AlphaEarth look-alike risk spots, camera-as-sensor.

### M5 — Surfaces — **built**
- One responsive Next.js app: Pulse, Agent, Twin, Photo check, Methods & limits. No login. The CISE operator console pages are optional (D-18).

---

## 5. Non-Goals

Explicitly out of scope. Revisit only by adding an ADR that says why.

- A nationwide or Klang-Valley-wide twin in this build (D-04).
- Replacing official warnings (MET, JPS, NADMA, the coming Cell Broadcast System). Virtual KL complements and links to them.
- Hardware sensors or IoT deployment.
- Mobility / live bus tracking (considered and rejected for this build; see sources).
- Corporate overseas risk ops (the Petronas use case) — a scalability story in the pitch only.
- Running an LLM per agent per simulation tick.
- Real hydrodynamic flood modelling or claims of flood-depth accuracy.
- Collecting personal data beyond an opt-in channel identifier.
- Paid hosting or paid data APIs (D-07).

---

## 6. Build Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **MVP prototype — built 2026-10-22 (current submission)** | Foundation fixes; KL Pulse; proactive agent; KL Twin sandbox; photo check; methods page; Anthropic client in both apps | Verified: `tsc` clean, 72 unit tests, production build, live endpoints, real-browser check of all pages, backend pytest 122 pass. **Open:** hosted demo link (D-21), survey calibration; live Claude spot-checked 2026-10-22 |
| P1 Data depth | Chronos forecasts with a backtest against persistence; more KL sources; JPS re-check; data archive for future models | Backtest numbers recorded in STATUS |
| P2 Delivery & memory | Real alert delivery (Telegram/email via CISE), persistence for the approval queue, Groundsource flood memory, news digestion | An approved advisory is actually delivered and logged |
| P3 Calibration & evidence | Run the resident survey; replace illustrative persona parameters; replay evidence for the pitch | Persona parameters cite the survey; calibration label updated |
| P4 Expansion | Klang Valley townships (Bandar Bukit Raja, Putra Heights, Elmina), flood simulation once a live sensor or terrain model exists | A second region runs from the same code with its own focus areas |

---

## 7. Decision Log

Canonical one-line list. Load-bearing entries are expanded as ADRs in `changelog/DECISIONS.md` under the same id.

| # | Decision | Why |
|---|---|---|
| D-01 | Build on CISE (Lisa's FYP) and disclose it as background IP | ~90% of the plumbing exists; the team agreed to use an existing FYP |
| D-02 | Track: People → Safety & Security | Fits the problem (resident information and safety); Jie Hao's framing; one track only |
| D-03 | Product "Virtual KL": a resilience hub whose headline feature is the KL Twin sandbox | User choice: sandbox is the hero feature *inside* the hub |
| D-04 | Kuala Lumpur (the whole Federal Territory) is the unit; KL East, Melawati and KLGCC Resort are featured focus areas; expansion is roadmap | User instruction: "KL first, not virtual Malaysia", then "scope down to just the state of Kuala Lumpur" |
| D-05 | Three users; resident surface is public-first, operators and planners use console + sandbox | User delegated the call; the problem is resident information, the sandbox serves both operator and planner |
| D-06 | Anthropic API is the only LLM (replaces Ollama; supersedes CISE's local-LLM commitment) | User instruction; enables a hosted demo |
| D-07 | Free data tiers + Anthropic API only | User choice |
| D-08 | Autonomy ladder: auto-send low-risk only; Orange+ needs approval; Red never auto | Safety and trust; preserves CISE's human-in-the-loop |
| D-09 | Synthetic population = Claude-generated persona policies + rule engine; LLM only for generation, interviews, narration | Per-agent LLM calls at thousands of agents are too costly; mirrors AgentSociety 2's caching approach |
| D-10 | Everything simulated or illustrative is labelled in UI and API | Honesty; judges score evidence |
| D-11 | Forecasting with Chronos zero-shot (CPU) is the target; the MVP uses a CAMS model + bias adjustment instead (D-19) | Chronos needs PyTorch, which a free serverless host can't run |
| D-12 | 3D twin with deck.gl and/or Three.js; online code/assets may be reused with licence notices kept | User instruction (organisers reportedly agreed); StadiView is the visual reference |
| D-13 | KL Pulse sources: DOE via Haze Monitor, MET + JPS via data.gov.my, Open-Meteo (AQ, forecast, flood, WeatherNext 2 ensemble), Groundsource | All free and verified reachable on 2026-10-22 |
| D-14 | Team runs a short anonymous resident survey to calibrate personas; fallback to labelled literature defaults | User delegated; turns synthetic residents from guesswork into evidence |
| D-15 | Commit and push directly to `main`; `origin` = Azimlearning/virtual-kl (public, empty); push pending confirmation about publishing Lisa's FYP history (A-15) | User instruction; the new repo was created for this project |
| D-16 | Context material (team chat, hackathon notes, slides) stays outside the repo in `../context/` | Personal details in screenshots; SDP programme materials |
| D-17 | Deliverables and deadline are recorded, not planned around | User instruction: the team owns timing |
| D-18 | MVP = one standalone Next.js app (server routes call data sources + Anthropic); CISE engine stays as the optional roadmap engine | Demo link + video need free hosting; Postgres/Chroma/Neo4j can't be hosted free |
| D-19 | MVP forecast = Open-Meteo CAMS + bias adjustment to DOE; rain from WeatherNext 2 ensemble; Chronos deferred | PyTorch can't run on free serverless; labelled indicative |
| D-20 | Build first, then one combined verification batch | User instruction: test in bunches |
| D-21 | Demo link = Vercel free tier; config ready, **not deployed** | Needs the team's login and consent |
| D-22 | JPS flood data is frozen (2024-02-23): greyed layer only, never used for decisions; no flood simulation | Honesty (D-10) |
| D-23 | Persona parameters are illustrative defaults, labelled everywhere | No survey data yet |
| D-24 | 3D = MapLibre 6 + deck.gl over OpenFreeMap; worker file copied at build; dark-mode filter; Pulse flyover | Verified in a real browser; free, no key |
| D-25 | No API key means labelled templates (vision returns 503), never fake AI | Honesty; no key in the build environment |
| D-26 | Verification builds use `NEXT_DIST_DIR=.next-verify` | A concurrent `next dev` clobbers `.next` |
| D-28 | The twin is the home page; the agent acts first (autonomous loop, rehearses and drafts unprompted, asks only for decisions) | Proactive means initiative, and the simulation is the distinctive part |
| D-27 | Site-manager action is a lever in the sandbox | Outdoor workers are the most exposed and least helped by warnings; SDP's own sites are those workers |

---

## 8. Open Questions

Unresolved. Anything marked `ASSUMED:` is a working assumption, not a confirmed fact — it may be wrong, and it must be confirmed before anything load-bearing is built on it.

- **A-01** ASSUMED: SDP's "Melawati" belongs in the KL focus set. The briefing deck [s8] lists it under Kuala Lumpur; SDP's annual report lists "Melawati, Ampang Jaya" (Selangor). The map uses OSM's Desa Melawati (KL) as an approximate point.
- **A-02** ASSUMED: KL East is the hero development (default focus of the twin and the agent rehearsal).
- **A-05** VERIFIED (2026-10-22): `claude-sonnet-5-5` works for agent text, interview and vision with a real key. `claude-haiku-5-5` is still unexercised.
- **A-06** ASSUMED: Haze Monitor's free third-party API stays available (verified 2026-10-22: 68 stations, 2 in KL).
- **A-08** ASSUMED: the team can run the anonymous resident survey.
- **A-10** ASSUMED: non-commercial free tiers (Open-Meteo, GNews) are acceptable for the hackathon.
- **A-11** ASSUMED: organisers allow reuse of any online resources — conflicts with written T&C cl.10/cl.14; get it in writing.
- **A-13** ASSUMED: Groundsource has flood events overlapping KL (not queried; not in the MVP).
- **A-14** ASSUMED: the app deploys cleanly to Vercel's free tier with root `frontend/` (not attempted).
- **A-15** ASSUMED: it is acceptable to push this repo publicly, including Lisa's FYP code and history (needs Lisa's and the team's confirmation).
- Open: who is the team leader on the submission portal, and which members are registered?
- Open: the folder is still named `simedarby/` locally; renaming to `virtual-kl/` was blocked by Windows file locks (close the IDE and rename).

Resolved 2026-10-22: A-03, A-04, A-07, A-09, A-12 (see DECISIONS).

---

## 9. Glossary

- **API (air quality)** — Malaysia's Air Pollutant Index (Indeks Pencemaran Udara, IPU), published hourly by DOE. Not to be confused with a software API; docs write "API (air)" where ambiguous.
- **DOE / MET / JPS / NADMA** — Department of Environment; Malaysian Meteorological Department; Department of Irrigation and Drainage; National Disaster Management Agency.
- **CBS** — Cell Broadcast System being built by MCMC/NADMA for phone alerts.
- **Development** — an SDP township or integrated development (e.g. KL East); the unit Virtual KL scores and simulates.
- **KL Twin** — the sandbox: physical twin + social twin + decision sandbox.
- **Synthetic resident / persona policy** — a simulated person whose decisions follow a Claude-generated, survey-calibrated rule set. Never a real person.
- **Autonomy ladder** — L1 threshold alert → L2 forecast alert → L3 agent-drafted action → L4 agent-sent action (low risk only).
- **Groundsource** — Google's open dataset of 2.6M flood events extracted from news by an LLM (CC BY 4.0).
- **Chronos** — Amazon's pretrained time-series forecasting models (Apache-2.0), used zero-shot.
- **Guardrails** — CISE's checks on AI output: grounding score, numeric grounding, domain constraints (alert level), extended with policy rules.

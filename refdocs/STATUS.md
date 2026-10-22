# Virtual KL — Build Status

> **Read this first to know where we are.** Updated at the end of every build session. Phases and scope come from `refdocs/virtual-kl-PRD.md` §6. Don't reorder phases without updating this file and saying why (CLAUDE.md "keep docs current").

**Build philosophy:** Build the whole slice, then verify it in one batch (D-20). Status never rounds up: "built" means it ran and was checked.

**Right now:** The **MVP prototype is built and verified locally** (2026-10-22): five pages (KL Pulse, Proactive agent, KL Twin sandbox, Photo check, Methods & limits), live Kuala Lumpur data, a 3D map, a seeded population simulation, guardrails, and the Anthropic client in both apps. **Not done:** (1) any live Claude call, because no `ANTHROPIC_API_KEY` exists in this environment (all model paths ran against a fake client and the template fallback); (2) a hosted demo link (D-21, needs the team's Vercel login); (3) the first `git push` (A-15, publishing Lisa's FYP code and history). The next step is in "Next actions" below.

---

## Phase checklist

| Phase | Scope | Status |
|---|---|---|
| MVP prototype | Foundation fixes, KL Pulse, proactive agent, KL Twin sandbox, photo check, methods page, Anthropic client | 🔶 **Built and verified locally**; live model output, hosted link and survey calibration still open |
| P1 Data depth | Chronos forecast + backtest, more sources, JPS re-check | ⬜ Not started (Chronos deferred, D-19) |
| P2 Delivery & memory | Real alert delivery, persistence, Groundsource flood memory, news digestion | ⬜ Not started |
| P3 Calibration & evidence | Resident survey, replace illustrative persona parameters | ⬜ Not started |
| P4 Expansion | Klang Valley townships, flood simulation | ⬜ Not started |

Status vocabulary — use these exactly, and never round up:
- ⬜ **Not started**
- 🔶 **In progress** — say precisely what works and what doesn't
- ✅ **Done** — built *and* verified. If it compiles but was never run, it is not done.
- ⛔ **Blocked** — name the blocker and who/what unblocks it

---

## MVP prototype (current phase)

| Item | Approach | Status |
|---|---|---|
| Frontend foundation | Removed Firebase/Gemini/Drizzle remnants and dead components; one lockfile; vitest; type errors no longer ignored | ✅ `tsc` clean, build passes |
| KL data layer | DOE (Haze Monitor), Open-Meteo CAMS + WeatherNext 2 ensemble, MET forecast/warnings, JPS (frozen) | ✅ live endpoint returns all sources with freshness |
| KL Pulse (`/`) | 3D map, DOE columns, SDP focus rings, haze veil, flyover; stats; 48 h chart; MET panels | ✅ rendered in a real browser, 0 errors |
| Proactive agent (`/agent`) | 5 steps, day-aware times, rehearsal on the twin, EN/BM advisories, guardrails, approval queue | 🔶 Templates verified live; **Claude-written text unverified (no key)** |
| KL Twin sandbox (`/twin`) | Seeded residents (animated commute), replay of a real onset, interventions, comparison, interviews | 🔶 Engine + UI verified; interviews use templates until a key is set |
| Photo check (`/check`) | Claude vision + DOE corroboration | 🔶 Corroboration logic tested; returns 503 without a key (verified); **vision call unverified** |
| Methods & limits (`/about`) | Live source table, simulated vs real, limits | ✅ |
| Anthropic client (backend) | `app/intelligence/llm_client.py`, config, compose, requirements | ✅ unit-tested with a fake SDK client; live call unverified |
| Hosted demo link | Vercel free tier | ⛔ Not deployed — needs the team's login and consent (D-21) |
| First push | `origin` = Azimlearning/virtual-kl (public) | ⛔ Not pushed — publishing Lisa's FYP code/history needs confirmation (A-15) |

### Next actions

1. Team confirms A-15 (push the repo publicly?) — then the first push.
2. Set `ANTHROPIC_API_KEY` in `frontend/.env.local`, restart, and run the live checks listed under Known gaps (agent text, interview, photo check).
3. Deploy to Vercel (root `frontend/`, add the key) if a hosted link is wanted.
4. Run the resident survey and replace the illustrative persona parameters (D-23).
5. Record the demo video; use the replay scenario (the haze onset on 12 Oct) for the story.

---

## Verification ledger

What has actually been run, not what has been written. A row here needs a real command and a real result.

| Date | What was verified | How | Result |
|---|---|---|---|
| 2026-10-22 | Backend tests (baseline, before work) | `python -m pytest -q`, system Python 3.13 | ❌ `ModuleNotFoundError: asyncpg` (dependencies not installed) |
| 2026-10-22 | MET warnings / district forecast | `curl -sL` data.gov.my | ✅ live JSON (KL = location Ds058) |
| 2026-10-22 | JPS flood stations | `curl -sL` data.gov.my flood-warning | ⚠ 58 KL stations, **all last updated 2024-02-23** (frozen) |
| 2026-10-22 | DOE air quality | `curl` Haze Monitor | ✅ 68 stations; 2 in KL (Batu Muda API 155 Unhealthy, Cheras 100–106; Cheras carried over from the previous hour) |
| 2026-10-22 | Open-Meteo air quality + ensemble | `curl` | ✅ model US AQI 156 vs DOE 155 at 21:00; 63 ensemble members; 90% chance ≥ 1 mm in 12 h |
| 2026-10-22 | Real haze onset in history | Open-Meteo, 45 days | ✅ model crossed 100 at 13:00 on 12 Oct (AQI 125) and reached 272 within 36 h |
| 2026-10-22 | Secret-guard hook | fake hook JSON | ✅ planted Anthropic key / Telegram token → exit 2; clean → 0; `.env` → 0; malformed → 0 |
| 2026-10-22 | Scaffold integrity | token grep, `git check-ignore`, link and id diffs | ✅ |
| 2026-10-22 | Frontend type check | `npx tsc --noEmit` | ✅ clean (after fixing a latent CISE error: orphaned `IngestionBar` imported a missing action; and the maplibre import) |
| 2026-10-22 | Frontend unit tests | `npx vitest run` | ✅ **72 passed** (5 files: scoring, sources, guardrails, twin, agent/llm/check) |
| 2026-10-22 | Production build | `npm run build` (isolated `NEXT_DIST_DIR`) | ✅ 17 routes |
| 2026-10-22 | Live endpoints (production server) | `curl` `/api/kl/snapshot`, `POST /api/agent`, `POST /api/check`, `POST /api/twin/interview` | ✅ snapshot 200 with all sources; agent 200 (Orange, 4 advisories, guardrails passed, templates); check → 503 without key (as designed); interview 200 (template) / 400 on bad body |
| 2026-10-22 | Real-browser pass (puppeteer-core + Chrome) | all five pages | ✅ 0 console/page errors (excluding the Vercel analytics script that only exists on Vercel); map canvas 1169×560; 16–20 tiles loaded, 0 failed |
| 2026-10-22 | Backend tests after the Anthropic swap | `pytest` in a venv with `chromadb` **stubbed** (see Known gaps) | ✅ **122 passed** (includes 2 new `test_llm_client.py`) |

### Defects found by the batch and fixed (D-20)

- MapLibre 6 worker not loading under Turbopack → copy worker to `public/` (D-24).
- MapLibre's CSS overrode the container's `position`, collapsing the map to 300 px → inline positioning.
- Replay window started inside the haze (history too short, onset not chosen) → 21 days of history, onset-based window.
- Ambiguous times ("8 PM") → "8 PM tomorrow" / "8 PM esok".
- Scenarios identical when the event was already under way → "sent now" comparison.
- A frozen-but-recent DOE carry-over was flagged "stale" → shown as a note.
- A latent CISE type error was hidden by `ignoreBuildErrors` → flag removed, orphaned component deleted.
- `next build` failed while another session ran `next dev` in the same folder → isolated output dir (D-26).

---

## Known gaps

- **No live Claude call has ever run** (no key here). Unverified: model advisories passing the guardrails, interview quality, vision output and the real shape of a model reply. The code path is covered by a fake client and a retry-on-bad-JSON test.
- **Backend tests ran with a stub for `chromadb`.** `chroma-hnswlib` can't build on Python 3.13/Windows and Docker isn't installed here, so the 122 passing tests exercise everything except a real Chroma server. Run the suite on Python 3.12 or in Docker to remove this caveat.
- **No forecast backtest exists.** The bias-adjusted forecast is a heuristic (D-19); only one day of agreement (156 vs 155) is recorded.
- **Persona parameters are illustrative** (D-23); the survey hasn't run.
- **Flooding is not forecast or simulated** (JPS frozen, D-22).
- **Resident positions are illustrative**, not real addresses or buildings.
- **Not deployed**, not pushed (D-21, A-15). Local folder still named `simedarby/` (Windows file lock; rename to `virtual-kl/` after closing the IDE).
- **Another session is redesigning the frontend** (fonts, theme, logo, page headers). Its edits and mine share `frontend/`; re-run the verification batch after merging both.
- **`npm run lint` doesn't exist** (eslint not installed); `tsc` is the static check.
- **CISE engine pages** (`/engine`, `/incidents`, …) are untested in this session and need the FastAPI backend.
- **Neo4j dev password** is hard-coded in `docker-compose.yml` and `app/config.py` (dev only).
- **Resident survey, `THIRD_PARTY_NOTICES.md`**: the survey is a guide, not yet run; no third-party code was copied, so the notices file isn't needed yet.

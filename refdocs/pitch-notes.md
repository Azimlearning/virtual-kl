# Pitch notes: key points for the slides and the video

Written for the team making the deck and the 5-minute video. Everything here is checked against the running prototype or a cited source; where a number is simulated or assumed it says so. Update this file when the build changes. Last updated 2026-10-23.

---

## 1. One line, one story

**One line:** *Virtual KL lets a township operator rehearse a warning on a digital twin of Kuala Lumpur before sending it, and then helps them act on it, including on the people a warning can't reach.*

**The story in five beats** (use as the video spine):
1. **Problem.** In haze, residents get a number (API) and a generic alert, often after it has started. People act on what they trust and understand, and the most exposed, outdoor workers, usually can't just stay in.
2. **Who.** Township operators and community managers (send and decide), SDP planners (compare options), and the residents they protect. Outdoor workers on SDP's own sites are the sharpest case.
3. **Solution.** An agent that acts first, on one loop: **Watch** live data → **Anticipate** the next 48 h → **Rehearse** the warning on thousands of simulated residents → **Decide** how much autonomy the agent has → **Act**: draft complete advisories in English and Bahasa Malaysia, plus a site-manager action.
4. **Innovation.** Rehearse before you send (a township-scale digital twin with synthetic residents), a proactive agent with guardrails and a human in the loop, photo corroboration against sensors, and honest labelling of everything simulated.
5. **Proof.** It runs on live KL data today, with real Claude output, and the sandbox found something non-obvious: a warning alone barely helps outdoor workers; a site-manager action does.

## 2. Problem and evidence (real, citable)

- KL had real haze this month: the air-quality model crossed API-equivalent 100 at 13:00 on 12 Oct (AQI 125) and reached 272 within 36 h; on 22 Oct the DOE station at Batu Muda read API 155–157 (Unhealthy) and Cheras 135–138. (Our data, `STATUS.md` ledger.)
- DOE reported unhealthy readings in 38 areas of Peninsular Malaysia on 8 Oct 2026 (Bernama, via search). The official source is APIMS in the MyJAS EQMS app.
- National Haze Action Plan trigger we use: suspend outdoor student activities above API 100; close schools above 200 (MOE). NADMA escalates when readings stay above 150 for more than 24 h.
- **What exists already, so don't claim novelty here:** APIMS / MyJAS EQMS (readings and advice), NADMA flood SMS, MCMC cell broadcast in development. Those are national and one-size. Our gap: township-level action on SDP's own channels and sites, rehearsed first.
- KL has only **2 DOE stations** (68 nationally); the JPS flood feed for KL is **frozen since 23 Feb 2024**, so we show it greyed and never use it for decisions. Say it: honesty about data limits is a feature.

## 3. What the product does (demo order)

| Page | One sentence for the video | What to show |
|---|---|---|
| **KL Twin (home)** `/` | Thousands of simulated residents commute around a development while the real haze replays, and it starts by itself. The agent has already rehearsed the options and picked one. | Let it auto-play; point at the agent narration on the map and the "Agent's pick"; switch interventions; pick a persona and interview them (Claude). |
| **The agent acts first** (feed beside the twin; `/agent`) | Not a button: it watched Kuala Lumpur on its own, rehearsed seven options, drafted bilingual advisories, and only asks you to decide. | The feed within seconds of opening: *Noticed / Rehearsed / Drafted*, the "needs you" chips; click **Show it on the twin**, then **Approve all**; mention Red is never auto-sent. |
| **Live data** `/live` | The real picture it is acting on: DOE readings, 48 h forecast, MET, source freshness. | Slow flyover, headline, a station tooltip. |
| **Photo check** `/check` | A resident's photo is read by a vision model and checked against the nearest live sensor: corroborated, contradicted or unverified. | Upload a hazy skyline → *corroborated* (Cheras API 114, 5.8 km); a clear photo → *unverified*, never a guess. |
| **Methods & limits** `/about` | Live source status, what is simulated, known limits. | Show it on screen briefly; it answers "is this real?". |

**Demo rules:** the first visit in a browser shows a 20-second intro and tour (press Escape to skip, "?" in the header replays it); record with it skipped or use it as the opening; use the **Replay** (the live forecast is already above 100, so the "warn early" story collapses); run the demo on a real GPU laptop (our test machine rendered in software); record while the live feeds are up and keep the recording as the backup.

## 4. The headline results (all SIMULATED, illustrative parameters)

Replay of the real 12 Oct onset at KL East, 3 000 synthetic residents, mean outdoor hours above API 100 per resident. Always say "simulated, illustrative".

| Option | Whole population | Outdoor workers |
|---|---|---|
| No proactive warning | 4.19 h | 8.83 h |
| Complete advisory 6 h before | 3.77 h (**−10%**) | 8.58 h (**−3%**) |
| **Site-manager action only** | 3.93 h (−6%) | 6.19 h (**−30%**) |
| Complete advisory + site-manager action | 3.49 h (**−17%**) | 5.77 h (**−35%**) |

By group, for the complete 6 h advisory: respiratory −28%, parents −19%, commuters −12%, elderly −10%, students −5%, outdoor workers −3%.

**The insight to land (it's the "wow"):** *Warnings fix people who can act. They don't fix exposure set by employers. The twin showed that, and then tested the fix.* Outdoor workers: 10% of the residents but about 8.8 h exposed, twice the average; the site action saves about 10× the worker-hours a warning does (778 vs 76 in this run).

**How solid is it?** Jittering every parameter by ×1.2 to ×2 (900 draws), "complete beats generic, earlier beats later, warning beats nothing" held in all 900. The site-action gain stays above the warning-only gain for every compliance (0.3–0.9) and protection (0.25–0.6) tested, from 12% to 68%. **Direction is robust; size is an assumption.** Two further honest points: most of the warning's gain comes from a *complete* message, not from days of lead time (6 h and 12 h are identical); and the sandbox is built so warnings help, so it tests plans, it doesn't prove outcomes. Those numbers get replaced by the survey and operator interviews.

## 5. How it works (the "Enabler" slide)

- **Data (free, live):** DOE API via a third-party feed (2 KL stations), Open-Meteo / Copernicus CAMS model (21 days of history, 3 days forecast), Google WeatherNext 2 rain ensemble (63 members), MET Malaysia forecast and warnings, JPS flood stations (frozen, greyed).
- **Forecast:** CAMS model shifted by today's gap to the DOE reading, tapering over 48 h. Labelled indicative. (The gap was +44 on 22 Oct: the model reads lower than the DOE API; say it plainly.)
- **Policy:** MOE thresholds (100 / 200), autonomy ladder: Green may auto-send; Orange and Red need a human; **Red is never auto-sent**.
- **Agent + guardrails:** Claude (`claude-sonnet-5-5`) drafts the advisories; code checks that every number is grounded in the data, the level isn't overstated, no medical claims, and the message is complete (what/where/when/action). If a check fails or there's no key, a deterministic bilingual template is used and labelled. No key never means fake AI.
- **Twin:** seeded, reproducible population (8 personas), per-resident chain: hear → trust → act → exposure; interviews are in-character and limited to the facts of that run.
- **Stack:** Next.js 16, React 19, MapLibre GL + deck.gl over OpenFreeMap (3D buildings), Recharts, Anthropic API (server-side only), Vercel free tier. 84 unit tests; stress-tested (`stress-test-2026-10-23.md`).
- **Under it:** Lisa's CISE engine (global hazard ingestion, RAG briefing, guardrails, alerts), kept as the optional engine and roadmap. Disclosed as background IP.

## 6. Against the six judging dimensions and the weights

| Dimension (weight) | Our answer | Weak spot to fix |
|---|---|---|
| Impact & sustainability value (25%) | Fewer exposed hours for the groups that matter; the site action for outdoor workers; measured in simulated hours (labelled). | Needs real evidence: survey + operator interviews. |
| Innovation (20%) | Rehearse-before-send twin; proactive agent with guardrails; photo corroboration; the sandbox found a non-obvious lever. | Don't call "haze alerts" innovative; call the loop innovative. |
| Feasibility (20%) | Runs today on free data; SDP-controlled levers (own sites, own channels); a human approves. | Delivery channel not wired (approve doesn't send). |
| Strategic fit (15%) | People → Safety & Security; SDP's Climate Resilience and Community Experience pillars; SDP's own construction sites; 0.26% lost-time injury rate and 983 employees trained in H&S show it already cares. | Frame haze as resident and worker safety under an environmental hazard. |
| Commercial & value multiplication (10%) | Per-township module for community management; planners' what-if tool; contractors' site safety; same engine for flood, heat. | No pricing work yet. |
| Team, evidence & pitch (10%) | Live data, real Claude output, tests, honest limits. | **No resident or operator validation yet. Biggest gap.** |

Scalability: 28 active SDP townships; KL first (KL East, Melawati, KLGCC), the focus-area registry and personas are data, not code.

## 7. Slide skeleton (10 slides, the brief's eight areas)

1. Title and one line.
2. **Problem:** haze data is plentiful; action is not. The outdoor-worker gap (8.8 h, −3%).
3. **Target user:** operator / planner / resident; a site manager as the sharpest case.
4. **Solution:** the one loop (Watch → Anticipate → Rehearse → Decide → Act).
5. **Innovation:** rehearse before you send; guardrails; the twin found the gap.
6. **How it works:** screenshots of Pulse, Agent, Twin, Check; the stack in one line.
7. **Impact:** the table in section 4 (labelled simulated) + the group results.
8. **Feasibility:** live today, free data, human in the loop, honest limits; a pilot at KL East.
9. **Implementation:** pilot plan: operators + one site; survey + interviews replace the assumptions; WhatsApp/Telegram delivery next.
10. **Ask / next steps** and the team. Appendix: methods, sensitivity, data sources, limits, IP disclosure.

## 8. Five-minute video skeleton

- 0:00 Hook: Batu Muda at API 155 on 22 Oct; "what does an operator do at 2 PM?"
- 0:30 Open the app: the twin is already playing and the agent has already looked, rehearsed and drafted (no click). Say what it noticed.
- 1:15 The agent's pick, its narration on the map; approve the drafts (a human decides; Red is never auto-sent).
- 2:00 Compare options on the twin → interview a resident.
- 3:15 **The finding:** outdoor workers barely helped → add the site-manager action → −30%.
- 4:00 Photo check (haze → corroborated; clear → unverified).
- 4:30 Honest limits + what the survey and interviews will replace; close on the loop.

## 9. Say these, don't say those

**Say:** "simulated, with illustrative parameters"; "direction is robust, size is an assumption"; "a human approves Orange and Red; Red is never auto-sent"; "it rehearses before it sends".
**Don't say:** "runs in the background 24/7" (the agent loop runs while a tab is open; a scheduled worker is the roadmap); "proven to reduce exposure"; "predicts haze" (we shift a model forecast; it's indicative); "real-time flood" (JPS is frozen); "sends alerts" (it drafts and a human approves; delivery isn't wired); "validated with residents" (not yet); "first"/"only" (APIMS, NADMA and MCMC exist).

## 10. Likely judge questions (short answers)

- **DOE/NADMA already do this?** They do national readings and generic alerts. We do township action: what SDP's own channels and sites should do, rehearsed before sending.
- **How does a warning reach residents?** Drafted and approved today; delivery to WhatsApp/Telegram/email is the next step (CISE already has Telegram and email). We found no SDP resident app, so the channel is an assumption we will confirm.
- **Is the simulation real?** It's a planning tool with labelled illustrative parameters; sensitivity tested; calibrated by the survey and operator interviews next.
- **Why is the site action only 30%?** Not every crew complies (assumed 60%) and work-rest only cuts exposure so far (assumed 40% residual). Interviews will replace both.
- **What if the data feeds fail?** The agent says it can't assess and sends nothing; pages show which sources are down.
- **Cost / abuse?** Per-IP limits on model calls; templates when limited; key is server-side only.
- **Safety & Security?** Safer environments for residents and workers under an environmental hazard.

## 11. Open items that change the story

- Survey (Lisa, Bubu) and 2–3 operator interviews (Azim, Chan): see `guides/resident-survey.md`. One evidence slide.
- Hosted demo link (Vercel) and a recording of the demo.
- Confirm with organisers that reusing online resources is allowed in writing (A-11).
- Confirm Melawati's classification (A-01).
- Monthly spend limit on the Anthropic key before sharing a public URL.

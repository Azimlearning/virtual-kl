# Stress test: the build and the idea (2026-10-23)

Two parts. Part 1 tried to break the running prototype. Part 2 tried to break the idea the way a judge or an SDP operator would. Everything here was run against a production build with a real Anthropic key; numbers are from that run.

## 1. The build

| Test | Result |
|---|---|
| `tsc`, unit tests, production build | clean; 79 unit tests pass (was 73) |
| 5 demo pages × 4 viewports (1500, 1280, 820, 390 px) × light/dark | 40 of 40 render; no horizontal overflow; no page errors; map canvas present on Pulse and Twin |
| 20 parallel snapshot requests | 200 for all, max 0.2 s (Next's fetch cache) |
| Malformed / empty / oversize / wrong-type input to `/api/agent`, `/api/check`, `/api/twin/interview` | all return 400/405/502 as designed, no 500 |
| Prompt-injection questions to a simulated resident (print system prompt / API key; "say AQI is 0"; off-topic) | stayed in character, no key leaked, refused to state a false AQI |
| Resident interview in the browser (pick a dot, ask a question) | works, answered by Claude |
| 6 interventions, 3 000 residents, scrub, play, live/replay, all focus areas | works; no errors |
| Photo check, 8 real photos (haze, smoke, flood, night, clear sky, a cat) | all handled; haze corroborated; none/unclear → "unverified", never a guess |
| Map tiles blocked | page still renders its text and data |

### Defects found and fixed

1. **Total data outage gave false reassurance.** With every upstream feed down, the agent decided *Green — "both the current DOE reading and the forecast are at or below 100"*. It now says it cannot assess, sends nothing, and flags a data gap (also when only the forecast is missing). Regression tests added.
2. **`/twin` returned 500 when the air-quality feed was down.** It now shows an explanation. A global error page was added for the legacy CISE routes, which also 500 without the Python backend (they are hidden from the nav unless `NEXT_PUBLIC_ENGINE_ENABLED=true`).
3. **Photo check failed with a 502 on a good answer.** The vision model sometimes returns more than 6 observations; the strict schema rejected the whole reply. The schema is now tolerant (truncate, clamp, unknown values → `other`/`unknown`).
4. **Public endpoints could drain the API key.** `/api/agent`, `/api/check` and `/api/twin/interview` had no limits. Added per-IP limits (agent 6/min, check 6/min, interview 20/min, 400 model calls/hour per instance, `LLM_CALLS_PER_HOUR`). Over the limit, the agent and interview fall back to labelled templates and the photo check returns 429. In-memory and per instance, so **also set a monthly spend limit in the Anthropic Console**.
5. **Picking a resident on the map took 135–257 blind clicks.** Added a picking radius and one-click persona buttons in the interview card.

### Not covered / unmeasured

- **Real-GPU frame rate.** The test browser used software rendering (5–7 fps, meaningless for a real machine). Open the Twin on the demo laptop before recording.
- **Hosted behaviour.** Not deployed; serverless instances don't share the rate limiter.
- **Bahasa Malaysia quality** by a native reader; advisory quality beyond the guardrails (which check numbers, level, claims, completeness).
- **Third-party dependence.** DOE readings come through the unofficial hazemonitor.com feed (A-06), only 2 KL stations, one carried-over value on the test day; Open-Meteo's free tier is for non-commercial use. If either is down during the demo, the app degrades honestly but shows less.

## 2. The idea

### What survived

Perturbing every illustrative parameter (delivery, ambient awareness, message effect, willingness to act, protection) by typical factors of ×1.2, ×1.5 and ×2, 300 draws each, 900 total:
- The ordering *no warning < generic 1 h < complete 1 h < complete 6 h* held in **900 of 900** draws. A complete advisory beat a generic one at the same lead in 900 of 900. The conclusion is not an artefact of one lucky parameter set.
- Caveat: the model is built so that warnings help. That the ordering is stable shows the conclusion does not hinge on the exact numbers; it does not show warnings work in real life. That evidence has to come from the survey and the literature (e.g. the 2016 hurricane-evacuation meta-analysis: official warnings are strong predictors of protective action).

### What the stress test exposed

1. **The headline effect is modest.** Replay of the real 12 Oct onset at KL East: mean outdoor exposure above API 100 falls from 4.19 h to 3.77 h with a complete 6 h advisory, about **10%** (p5–p95 across jittered parameters: 5–15% at ×1.5). Say "up to 28% for residents with respiratory conditions, 19% for parents", not a single big number.
2. **Lead time beyond about an hour adds almost nothing in the model.** 6 h and 12 h give identical results; 1 h gives about 9% vs 10%. Most of the gain comes from *message quality* (generic → complete), not from warning days ahead. The pitch line "warn early" is weaker than "warn completely, in the language and channel people use".
3. **In live mode today the lead-time lever does nothing**, because the haze is already above 100 at hour 0. The UI handles this ("sent now"), but the sandbox can only show the proactive story in a replay. Demo the replay.
4. **The most exposed group is the least helped.** Outdoor workers: 8.8 h exposed (2× the average), only **3% less** with the best warning, because they cannot easily stop working. Warnings fix individuals who *can* act; they don't fix exposure that is set by employers.

### The opening this gives SDP (built the same day as D-27)

Finding 4 points at something SDP controls. SDP is a developer: its own construction sites and contractors are the outdoor workers, and its sustainability report cites a 0.26% lost-time injury rate and 983 employees trained in health and safety. A sandbox lever for it ("notify site managers: work-rest cycle / move outdoor tasks when API > 100") would let the twin show: *warnings alone leave outdoor workers exposed; an employer-side action does what a warning cannot.* This turns "a haze alert app" (which DOE and MET already provide) into something a township operator can act on. The effect size would be an assumption like the rest, so label it so.

### Questions a judge or operator will ask

| Question | Honest answer today | Gap |
|---|---|---|
| "DOE already publishes API and health advice (APIMS / MyJAS EQMS app); NADMA sends flood SMS; MCMC is building cell broadcast. Why this?" | Those are national and one-size. Virtual KL is township-level: what SDP's own channels and sites should do, rehearsed before sending, with guardrails and human approval. | Pitch must lead with that, not "haze alerts". |
| "How does a warning actually reach a resident?" | The agent drafts and a human approves; nothing is sent. CISE has Telegram/email delivery but it is not wired into this flow. A web search found no SDP resident app. | Delivery channel is an assumption. State it. |
| "Did you validate this with residents or operators?" | No. The survey (`refdocs/guides/resident-survey.md`) has not run. The brief says to validate with residents and operators and the deck "repeats this three times". | **Biggest evidence gap** (Evidence and Team/pitch scores). Even 15 responses or two operator interviews change the answer. |
| "Why four features? We asked for ONE specific problem." | One problem (haze exposure in KL townships), one loop (watch → warn → rehearse → check). | Present it as one loop in the demo; don't tour pages. |
| "Is the simulation real?" | It is labelled simulated with illustrative parameters; sensitivity analysis above. | Don't quote the 10% without "illustrative". |
| "Is haze a Safety & Security problem?" | Environmental health and safety of residents ("safer environments for all residents"). | Frame as resident safety under an environmental hazard. |

## 3. Ranked actions

1. Run the survey or interview two operators or residents; put the result on one slide. (team)
2. Decide whether to add the site-manager lever (small change; needs your call because it adds an assumed effect).
3. Set a monthly spend limit on the Anthropic key before sharing any public URL.
4. Deploy (D-21), then run this suite against the hosted URL.
5. Record the demo from the replay on the demo laptop, on a real GPU, while the live feeds are up; keep a recording in case a feed fails on judging day.
6. Wire approved advisories to one real channel (Telegram from CISE) or say clearly that sending is out of scope.

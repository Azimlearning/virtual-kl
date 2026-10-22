# Brainstorm — Virtual KL (2026-10-22)

> The founding concept, refined over one session with the user (Azim), grounded in the team chat, the hackathon brief and live research. The PRD is the decided version; this file keeps the reasoning and the evidence so the pitch can reuse it. Sources: `virtual-kl-sources.md`.

---

## 1. How we got here

| Step | Input | Outcome |
|---|---|---|
| Team chat | Poll: Lisa's FYP 4, Jie Hao's FYP 1, new project 0. "Don't start a new idea — go all in on someone's FYP." | Build on CISE (D-01) |
| Team chat | Jie Hao: Planet/Climate Resilience? Then: "maybe Safety & Security — safety includes the unexpected, like climate crises… we don't have a centralised platform for township people about disasters… dashboard on IPU, weather, forecast from sensors." Alt: transport & mobility. | People → Safety & Security (D-02) |
| Team chat | Lisa's lecturer: Petronas risk ops wants easier hazard scanning and public sentiment; also wanted image/video and social media digestion (cut for FYP scope). | Kept as scalability story + ground-truth module (M4) |
| Team chat | Jie Hao: "dashboard should be universal, suitable for public view." Azim: "focus a lot on the data visual side." | Public resident page; visual-first sandbox |
| Session | User: cloud LLM only, Anthropic key. | D-06 |
| Session | User wanted a wow factor: "proactive AI agent instead of reactive", "advanced model", "something not possible before AI". | Proactive agent (M2) + AI-native data chain |
| Session | User: "a simulated huge sandbox… buzzword-ish, visual, attractive to judges." | KL Twin sandbox (M3) |
| Session | User: sandbox is the hero feature *inside* the hub; used by operators and planners; KL first, not virtual Malaysia; name "Virtual KL"; StadiView as visual reference; reuse of online resources OK. | D-03, D-04, D-05, D-12 |

---

## 2. The problem, with evidence

**Residents don't get timely, specific, trusted information about what a hazard means for their street and what to do; operators can't foresee who will be affected or rehearse the warning.**

- **Information channel failure:** after the Putra Heights fire (Apr 2025), residents "don't know who to ask or who is the main channel" and made their own chat group (Malay Mail).
- **Warnings that don't drive action:** in the Taman Sri Muda study, residents learned from neighbours and WhatsApp; SMS lacked flood depth, road closures and shelters; sirens were "uninterpretable" and some residents "stopped believing" them (SSRN 2026).
- **SDP's own exposure:** Bandar Bukit Raja flash floods three times a year since Dec 2021; ~2,000 homes affected in Nov 2024; SDP's MD: "a top priority" (FMT, The Edge).
- **Right now:** very strong El Niño; haze closing schools at API > 200 in Selangor (Oct 2026); MET expects extremely hot, dry conditions Jan–May 2027.
- **Official systems are fragmented:** MyJAS EQMS (air), myCuaca (weather), PublicInfoBanjir (rivers), SMS and the coming Cell Broadcast System. Cell broadcast says *that* something is happening; it doesn't say what it means for your street or what to do.

Why SDP should care: the brief asks how to "multiply the value of a township even after we have fulfilled our responsibility as a developer" [s12]. SDP's 2025–2030 strategy has a **Climate Resilience** pillar and a **Community Experience** pillar [s9], and SDP already runs climate modelling across townships.

---

## 3. The concept: Virtual KL

**A resilience hub for SDP's KL developments, with a digital-twin sandbox inside it.**

1. **KL Pulse** — every reading for every development, with its age shown. Haze (DOE), warnings and forecasts (MET), rivers (JPS), AI ensemble weather probabilities.
2. **Proactive agent** — Watch → Anticipate → Simulate → Decide → Act → Learn. It acts on the forecast, not the threshold crossing; asks the twin before it warns; sends low-risk advisories itself and queues serious ones for a human; writes complete messages in BM/EN.
3. **KL Twin sandbox (headline)** — a 3D twin of a KL development with thousands of synthetic residents. Rehearse mode (operator): "warn at T−6h vs T−1h — who acts in time?" Plan mode (planner): "what if this retention area is used?" Interview a simulated resident: *"Why didn't you leave?" → "The message didn't say which roads were closed."*
4. **Ground truth** — resident photos checked by Claude vision against sensors; a street-level flood memory built from news (Groundsource + Malay/English local news).

**One-line pitch:** *Virtual KL lets a township see tomorrow before it happens — and warn the right people, in their language, before it rains.*

---

## 4. Why it's AI-native (what wasn't possible before)

| Before | Now | Used in |
|---|---|---|
| Flash floods barely recorded | LLM-extracted flood archive from news (Groundsource, 2.6M events) | M4 flood memory |
| Probabilistic weather only for national agencies | Free AI ensemble (WeatherNext 2, 64 members) via Open-Meteo | M1, M2 |
| Forecasting needs per-site training | Zero-shot time-series foundation models (Chronos) | M2 |
| Behaviour models needed hand-built rules and big surveys | LLM-generated personas aligned to small surveys | M3 |
| One warning text for everyone | Complete, personalised, multilingual messages | M2 |
| Water depth needs gauges | Vision models read depth from photos against reference objects | M4 |
| National digital twins (Virtual Singapore) need national budgets | Township-scale twin on open data + AI | M3 |

---

## 5. Honest limits (say them before judges do)

- A simulation is a planning tool, not proof; outcomes are labelled simulated (D-10).
- Synthetic residents are only as good as their calibration — hence the survey (D-14).
- Flood depth in the twin is illustrative (no hydrodynamic model).
- LLMs are weak on flood-related social posts and urgent requests (F1 < 0.6) — social signals never decide alone.
- Vision depth estimates vary run to run — show a range, require sensor corroboration.
- DOE coverage is sparse (68 stations; 15 fresh on 2026-10-22) — freshness is shown, not hidden.

---

## 6. Judging-criteria map

| Criterion (weight) | How Virtual KL answers it |
|---|---|
| Impact (25%) | Earlier, specific warnings; measurable via forecast backtests, time-to-awareness replay, simulated "acted in time" deltas (labelled) |
| Innovation (20%) | Proactive agent that rehearses on a digital twin before warning; survey-calibrated synthetic residents |
| Feasibility (20%) | Built on a working engine (CISE); free open data; runs on Docker |
| Strategic fit (15%) | People → Safety & Security; SDP Climate Resilience + Community Experience pillars; post-handover value |
| Commercial (10%) | Per-development module for SDP community management; Plan mode for SDP planners; same engine serves corporate risk teams |
| Team/evidence/pitch (10%) | Resident survey; cited research; live data; honest limits |

---

## 7. Parked ideas (roadmap)

Personal Safety Twin (household thresholds) · multilingual voice alerts · AlphaEarth look-alike risk spots · CCTV camera-as-sensor · Google flash-flood API · Aurora air-quality model · InSAR ground-motion watch · neural flood emulator · generative "your street" visuals · expansion to Klang Valley and all 28 SDP developments.

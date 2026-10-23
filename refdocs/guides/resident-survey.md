# Resident Survey — calibrating the synthetic residents

> Why this exists: the KL Twin's synthetic residents are only credible if their behaviour is anchored to real answers (D-14). Studies that aligned LLM agents to even a few hundred survey responses got agent answers within ±0.13 of humans on a 5-point scale. This survey also gives the pitch real resident evidence — the brief asks teams to validate the problem with residents.

Last updated: 2026-10-22

---

## Who runs it (decision, 2026-10-23)

Split by who has reach, so the developer is not the bottleneck:

| Who | Does | Target |
|---|---|---|
| **Lisa and Nur Farah ("Bubu")** | Build the Google Form from the questions below and share it in the networks they belong to: residents' and neighbourhood groups in KL East / Melawati / KLGCC if they are members, family, university and college groups in KL | 30+ responses, 3 minutes each; record the real count |
| **Azim and Por Jie Hao ("Chan")** | Two or three **operator interviews** (below), 15 minutes each, in person or by call | 2 minimum |
| **Harry** | Tallies the form export into the aggregate table (`../context/survey/` stays outside the repo) and drafts the one evidence slide | one slide |

Azim stays on the build and the demo video; the Form takes about 30 minutes to set up and the interviews are the part that matters most.

## Operator interviews (2 or 3, 15 minutes)

Who: a property or community manager (a condo or township management office), a site or safety officer from a construction site (ideally an SDP contractor), a school or kindergarten administrator.

1. In the last haze, how did you find out, and what did you actually do? Who did you tell?
2. Which channel do you trust and use to reach residents, staff or parents? (WhatsApp group, notice board, SMS, app)
3. **When air quality passed API 100, can you change work or activities on the day? What would you change, and how many sites or crews would do it if told?** (This replaces the assumed `SITE_COMPLIANCE` 0.6.)
4. **What does a work-rest cycle, rescheduling or an indoor break cut in real exposure hours?** (This replaces the assumed `SITE_PROTECT` 0.4.)
5. How early do you need a warning to act, and what makes you ignore one?
6. Would you use a tool where you can rehearse the warning before sending it? What would you need to trust it?

Record: role, area, date, and the answers in a few lines each (no names). Quotes go on the slide only with permission.

## Ground rules

- **Anonymous.** No names, phone numbers, emails, IC numbers or exact addresses. Ask for the *area* only (e.g. "KL East", "Melawati", "other KL", "outside KL").
- **Consent line at the top:** "This anonymous survey is for a university hackathon project on township safety. Answers are used in aggregate only."
- Google Forms or similar; share in the team's own networks and residents' groups where the team is a member. Don't scrape groups.
- Target: 30+ responses (A-08). Fewer is still useful — record the count honestly.
- Responses are exported as CSV into `../context/survey/` (outside the repo). Only aggregate numbers enter the repo.

## Questions (8, about 3 minutes)

1. **Where do you live?** KL East · Melawati · KLGCC Resort area · other Kuala Lumpur · outside KL
2. **Who is in your household?** (tick all) children under 12 · someone 65+ · someone with asthma or a breathing condition · someone with limited mobility · none of these
3. **During the recent haze or a flash flood, where did you *first* hear about it?** WhatsApp/Telegram group · official app or SMS (MET, JPS, NADMA) · news/social media · saw it myself · family/neighbours · didn't hear
4. **How much do you trust official alerts (SMS, sirens, apps)?** 1 (not at all) – 5 (completely)
5. **If you got this message, what would you do?** *"Haze expected to reach unhealthy levels (API > 100) in your area by 3 PM today."* — nothing · keep windows shut · cancel outdoor plans · keep children home · buy masks/purifier · other
6. **How much warning would you need to act?** under 1 hour · 1–3 hours · 3–12 hours · the night before · a day or more
7. **What stops you acting on a warning?** (tick all) unclear what to do · don't trust it · too many alerts · work/school can't change · don't know if it applies to my street · other
8. **Which would you use?** WhatsApp/Telegram message · a web page for my township · phone app · SMS · none

## How answers map to persona parameters

| Question | Persona parameter in the sandbox |
|---|---|
| Q2 | Share of each persona type in a development's synthetic population |
| Q3 | Channel reach: probability a persona sees a message from each channel |
| Q4, Q7 | Trust and alert-fatigue weights (how much a warning shifts behaviour) |
| Q5 | Action probabilities per message type |
| Q6 | Lead-time response curve (probability of acting vs hours of warning) |
| Q8 | Channel preference for the proactive agent's delivery plan |

If the survey doesn't happen, personas use literature defaults and the sandbox shows "calibration: literature defaults, not KL survey data".

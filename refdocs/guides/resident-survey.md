# Resident Survey — calibrating the synthetic residents

> Why this exists: the KL Twin's synthetic residents are only credible if their behaviour is anchored to real answers (D-14). Studies that aligned LLM agents to even a few hundred survey responses got agent answers within ±0.13 of humans on a 5-point scale. This survey also gives the pitch real resident evidence — the brief asks teams to validate the problem with residents.

Last updated: 2026-10-22

---

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

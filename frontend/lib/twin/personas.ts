import type { ChannelId, Intervention, Persona, PersonaId } from "./types"

/**
 * ILLUSTRATIVE persona parameters (D-23). They are plausible defaults, NOT measurements and NOT
 * calibrated to Kuala Lumpur residents. The resident survey (refdocs/guides/resident-survey.md)
 * exists to replace them. Everything the twin shows is labelled "simulated · illustrative defaults".
 */
export const CALIBRATION_LABEL = "Illustrative defaults — not yet calibrated to a KL resident survey"

function hours(spec: Record<number, number>, base = 0.02): number[] {
  return Array.from({ length: 24 }, (_, h) => spec[h] ?? base)
}

export const PERSONAS: Persona[] = [
  {
    id: "commuter",
    label: "Working commuter",
    group: "general",
    blurb: "Travels to work; outdoors at the stops, walkways and car parks around rush hour.",
    share: 0.24,
    outdoor: hours({ 7: 0.55, 8: 0.65, 9: 0.25, 12: 0.3, 13: 0.3, 17: 0.5, 18: 0.65, 19: 0.4 }),
    channels: { whatsapp: 0.55, official: 0.15, social: 0.25, none: 0.05 },
    baseAct: 0.55,
    protect: 0.45,
  },
  {
    id: "parent",
    label: "Parent of school-age children",
    group: "parents-schools",
    blurb: "School runs and after-school activities; reads school and neighbourhood groups.",
    share: 0.14,
    outdoor: hours({ 7: 0.7, 8: 0.6, 13: 0.55, 14: 0.4, 17: 0.5, 18: 0.55 }),
    channels: { whatsapp: 0.6, official: 0.15, social: 0.2, none: 0.05 },
    baseAct: 0.7,
    protect: 0.35,
  },
  {
    id: "student",
    label: "Student",
    group: "parents-schools",
    blurb: "School or college; outdoors at assembly, break and sport.",
    share: 0.12,
    outdoor: hours({ 7: 0.6, 8: 0.5, 10: 0.4, 13: 0.55, 14: 0.35, 16: 0.5, 17: 0.5, 18: 0.4 }),
    channels: { whatsapp: 0.4, official: 0.05, social: 0.5, none: 0.05 },
    baseAct: 0.35,
    protect: 0.55,
  },
  {
    id: "elderly",
    label: "Older resident (65+)",
    group: "elderly-respiratory",
    blurb: "Morning and evening walks, prayers, market trips; less likely to be on social media.",
    share: 0.12,
    outdoor: hours({ 6: 0.5, 7: 0.55, 8: 0.35, 17: 0.45, 18: 0.5, 19: 0.3 }),
    channels: { whatsapp: 0.3, official: 0.25, social: 0.1, none: 0.35 },
    baseAct: 0.6,
    protect: 0.3,
  },
  {
    id: "respiratory",
    label: "Resident with asthma / respiratory condition",
    group: "elderly-respiratory",
    blurb: "Already careful, highly motivated to act; most harmed if they don't.",
    share: 0.08,
    outdoor: hours({ 8: 0.4, 9: 0.2, 17: 0.35, 18: 0.3 }),
    channels: { whatsapp: 0.5, official: 0.25, social: 0.2, none: 0.05 },
    baseAct: 0.85,
    protect: 0.25,
  },
  {
    id: "outdoor-worker",
    label: "Outdoor worker",
    group: "outdoor-workers",
    blurb: "Construction, delivery, landscaping, security; cannot easily change where they work.",
    share: 0.1,
    outdoor: hours({ 8: 0.85, 9: 0.9, 10: 0.9, 11: 0.9, 12: 0.7, 13: 0.85, 14: 0.9, 15: 0.9, 16: 0.9, 17: 0.8 }),
    channels: { whatsapp: 0.4, official: 0.1, social: 0.2, none: 0.3 },
    baseAct: 0.4,
    protect: 0.75,
  },
  {
    id: "remote-worker",
    label: "Home-based / remote worker",
    group: "general",
    blurb: "Mostly indoors; short errands and exercise outdoors.",
    share: 0.12,
    outdoor: hours({ 7: 0.35, 12: 0.2, 18: 0.4, 19: 0.3 }),
    channels: { whatsapp: 0.5, official: 0.15, social: 0.3, none: 0.05 },
    baseAct: 0.6,
    protect: 0.4,
  },
  {
    id: "shift-worker",
    label: "Shift worker",
    group: "outdoor-workers",
    blurb: "Early or late shifts; commutes outside normal hours.",
    share: 0.08,
    outdoor: hours({ 5: 0.5, 6: 0.55, 21: 0.5, 22: 0.55, 23: 0.35 }),
    channels: { whatsapp: 0.5, official: 0.1, social: 0.2, none: 0.2 },
    baseAct: 0.45,
    protect: 0.5,
  },
]

export const PERSONA_BY_ID: Record<PersonaId, Persona> = Object.fromEntries(PERSONAS.map((p) => [p.id, p])) as Record<
  PersonaId,
  Persona
>

/** Probability the agent's delivery reaches a resident on each channel. Illustrative. */
export const DELIVERY: Record<ChannelId, number> = { whatsapp: 0.8, official: 0.9, social: 0.5, none: 0 }

/** Probability a resident hears about an ongoing event on their own (news, neighbours), without a proactive warning. */
export const AMBIENT: Record<ChannelId, number> = { whatsapp: 0.55, official: 0.6, social: 0.7, none: 0.25 }

/** How much a message's quality changes the chance people act (complete = what/where/when/action). Illustrative. */
export const MESSAGE_FACTOR = { generic: 0.6, complete: 1 } as const

/** Share of outdoor-worker crews whose site manager acts on a notification. ILLUSTRATIVE (D-27). */
export const SITE_COMPLIANCE = 0.6

/**
 * Residual exposure multiplier for a worker whose site manager reschedules heavy outdoor work and adds
 * work-rest cycles (lower = better protected). ILLUSTRATIVE (D-27); replace with operator interviews.
 */
export const SITE_PROTECT = 0.4

export const PRESET_INTERVENTIONS: Intervention[] = [
  { id: "baseline", label: "No proactive warning", leadHours: null, message: "generic" },
  { id: "generic-1h", label: "Generic alert, 1 h before", leadHours: 1, message: "generic" },
  { id: "complete-1h", label: "Complete advisory, 1 h before", leadHours: 1, message: "complete" },
  { id: "complete-6h", label: "Complete advisory, 6 h before", leadHours: 6, message: "complete" },
  { id: "complete-12h", label: "Complete advisory, 12 h before", leadHours: 12, message: "complete" },
  { id: "site-only", label: "Site-manager action only (no resident warning)", leadHours: null, message: "generic", siteAction: true },
  { id: "complete-6h-site", label: "Complete advisory, 6 h before + site-manager action", leadHours: 6, message: "complete", siteAction: true },
]

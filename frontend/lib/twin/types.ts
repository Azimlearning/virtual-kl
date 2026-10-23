import type { PersonaGroup } from "@/lib/kl/types"

export type PersonaId =
  | "commuter"
  | "parent"
  | "student"
  | "elderly"
  | "respiratory"
  | "outdoor-worker"
  | "remote-worker"
  | "shift-worker"

export type ChannelId = "whatsapp" | "official" | "social" | "none"

export type Persona = {
  id: PersonaId
  label: string
  group: PersonaGroup
  blurb: string
  /** Share of the synthetic population (sums to 1 across personas). */
  share: number
  /** Probability of being outdoors, by hour of day (24 values). */
  outdoor: number[]
  /** Where this persona typically hears about things. */
  channels: Record<ChannelId, number>
  /** Base probability of changing behaviour once informed and convinced. */
  baseAct: number
  /** Residual exposure multiplier once protected (lower = better protected). */
  protect: number
}

export type Resident = {
  id: number
  persona: PersonaId
  lat: number
  lon: number
  channel: ChannelId
  /** Individual trust in official-looking warnings, 0..1. */
  trust: number
  /** Where this resident heads when outdoors (illustrative; drives the map animation only). */
  destLat: number
  destLon: number
}

export type MessageQuality = "generic" | "complete"

export type Intervention = {
  id: string
  label: string
  /** Hours before the event start the warning goes out; null = no proactive warning (baseline). */
  leadHours: number | null
  message: MessageQuality
  /**
   * Also notify site managers / employers (outdoor-worker crews), who reschedule heavy outdoor work and add
   * work-rest cycles. Sent at the same lead as the warning (at the event start when leadHours is null).
   */
  siteAction?: boolean
}

/** A 48-hour (or shorter) scenario of hourly AQI values. */
export type Window = {
  kind: "forecast" | "replay"
  label: string
  /** Local times "YYYY-MM-DDTHH:00". */
  times: string[]
  /** Hourly AQI (US-AQI-scale model values, possibly bias-adjusted). Nulls become 0. */
  values: number[]
  /** Index of the first hour above the action threshold, or -1 if never. */
  eventStart: number
  /** Whether the window starts already above the threshold (leads collapse to "now"). */
  startsAbove: boolean
}

export type Outcome = {
  intervention: Intervention
  /** Hour index each resident learned about the event, -1 if never. */
  informedHour: Int16Array
  /** Hour index each resident changed behaviour, -1 if never. */
  actHour: Int16Array
  /** Hour index from which a site manager changed this resident's outdoor work, -1 if never. */
  siteHour: Int16Array
  /** Expected hours outdoors above the threshold, per resident. */
  exposure: Float32Array
  sendHour: number | null
}

export type PersonaSummary = {
  persona: PersonaId
  n: number
  meanExposureHours: number
  actedPct: number
}

export type Summary = {
  residents: number
  informedPct: number
  actedPct: number
  /** Share who changed behaviour by the time the event started. */
  actedBeforeEventPct: number
  /** Share of residents whose employer's site manager changed their outdoor work. */
  siteManagedPct: number
  meanExposureHours: number
  byPersona: PersonaSummary[]
}

export type ResidentState = "unaware" | "informed" | "protected" | "exposed"

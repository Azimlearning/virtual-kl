// Shared types for the Virtual KL MVP (D-18). Kuala Lumpur only (D-04).

export type Level = "Green" | "Orange" | "Red"

/** Per-source health, shown next to every reading (principle: receipts on everything). */
export type Freshness = {
  ok: boolean
  /** When we fetched it (ISO, UTC). */
  fetchedAt: string
  /** When the source says the data was observed/issued (ISO with offset), if it says. */
  observedAt?: string
  /** Minutes between observedAt and fetchedAt, if known. */
  ageMinutes?: number
  /** True when the data is older than the source's normal cadence (or the source flags a fallback). */
  stale: boolean
  error?: string
  note?: string
}

export type Station = {
  id: string
  name: string
  lat: number
  lon: number
  /** DOE Air Pollutant Index (Malaysia). */
  api: number | null
  category: string
  pollutant: string | null
  observedAt: string
  isFallback: boolean
}

export type HourPoint = {
  /** Local KL time, "YYYY-MM-DDTHH:00" (no offset; KL is UTC+8). */
  t: string
  pm25: number | null
  /** Model US AQI from Open-Meteo (CAMS). NOT the Malaysian API. */
  usAqi: number | null
}

export type MetDay = {
  date: string
  summary: string
  morning: string
  afternoon: string
  night: string
  minTemp: number | null
  maxTemp: number | null
}

export type MetWarning = {
  issued: string
  validFrom: string | null
  validTo: string | null
  headline: string
  text: string
  mentionsKL: boolean
}

export type FloodStation = {
  id: string
  name: string
  district: string
  lat: number
  lon: number
  indicator: string | null
  level: number | null
  updatedAt: string | null
  stale: boolean
}

export type RainProbability = {
  members: number
  /** Share of ensemble members with >= 1 mm in the next 12 h (0..1). */
  anyRain12h: number
  /** Share of members with >= 10 mm in the next 12 h (0..1). */
  heavyRain12h: number
  note: string
}

export type SourceStatus = {
  doe: Freshness
  aq: Freshness
  ensemble: Freshness
  metForecast: Freshness
  metWarnings: Freshness
  jps: Freshness
}

export type Snapshot = {
  generatedAt: string
  /** Index of the current hour in `series`. */
  nowIndex: number
  stations: Station[]
  series: HourPoint[]
  /** Bias-adjusted forecast aligned to `series` (null before nowIndex). See scoring.biasAdjust. */
  adjusted: (number | null)[]
  biasNow: number | null
  rain: RainProbability | null
  metDays: MetDay[]
  metWarnings: MetWarning[]
  floodStations: FloodStation[]
  status: SourceStatus
}

export type FocusArea = {
  id: string
  name: string
  kind: "sdp" | "station" | "city"
  lat: number
  lon: number
  radiusM: number
  /** Where the coordinate came from (A-03: nothing is invented). */
  source: string
  blurb: string
}

// ---------- agent ----------

export type PersonaGroup = "parents-schools" | "elderly-respiratory" | "outdoor-workers" | "general"

export type MessageParts = {
  headline: string
  what: string
  where: string
  when: string
  action: string
}

export type GuardrailResult = {
  numbersGrounded: boolean
  unknownNumbers: number[]
  levelOk: boolean
  claimsOk: boolean
  claimIssues: string[]
  complete: boolean
  missing: string[]
  passed: boolean
}

export type AdvisoryStatus = "auto-sent" | "pending-approval" | "approved" | "dismissed" | "blocked"

export type Advisory = {
  id: string
  audience: PersonaGroup
  level: Level
  en: MessageParts
  bm: MessageParts
  source: "claude" | "template"
  status: AdvisoryStatus
  guardrails: GuardrailResult
}

export type AgentStepId = "watch" | "anticipate" | "simulate" | "decide" | "act"

export type AgentStep = {
  id: AgentStepId
  title: string
  summary: string
  details: string[]
}

export type ScenarioSummary = {
  label: string
  leadHours: number | null
  message: "generic" | "complete"
  meanExposureHours: number
  actedBeforeEventPct: number
  informedPct: number
}

export type AgentRun = {
  generatedAt: string
  llm: "claude" | "template"
  llmNote?: string
  steps: AgentStep[]
  decision: {
    level: Level
    autonomy: "auto-send" | "needs-approval"
    rationale: string
  }
  simulation: {
    focusArea: string
    /** Always true. Sandbox output is labelled simulated (D-10). */
    simulated: true
    calibration: "illustrative"
    scenarios: ScenarioSummary[]
  }
  advisories: Advisory[]
}

// ---------- photo check ----------

export type PhotoObservation = {
  hazard: "haze" | "smoke" | "flood" | "fire" | "other" | "none"
  visibility: "good" | "moderate" | "poor" | "very-poor" | "unknown"
  /** Free-text observations from the image only. */
  observations: string[]
  /** Model's own confidence 0..1. */
  confidence: number
}

export type Corroboration = {
  verdict: "corroborated" | "contradicted" | "unverified"
  reasons: string[]
  nearestStation: { name: string; api: number | null; category: string; distanceKm: number; observedAt: string } | null
}

export type PhotoCheckResult = {
  observation: PhotoObservation
  corroboration: Corroboration
  /** Always true: this is a model reading of one photo, not a measurement. */
  indicative: true
}

// Thin fetch layer against the Python FastAPI backend - the single real
// data source for every page in this app. All functions here run
// server-side (Server Components / Server Actions only - never import
// this from a "use client" component), so these are server-to-server
// calls with no CORS concern, same pattern the Streamlit dashboard used
// with Python's `requests`.

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000"

async function apiFetch<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, API_BASE_URL)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }
  }
  const res = await fetch(url.toString(), { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText} (${url.pathname})`)
  }
  return res.json() as Promise<T>
}

// --- Raw backend shapes (mirror app/schemas.py and the FastAPI response models) ---

export type HazardEvent = {
  id: string
  hazard_type: string
  location_name: string
  latitude: number
  longitude: number
  severity_score: number
  alert_level: "Green" | "Orange" | "Red"
  timestamp: string
  alert_triggered: boolean
  source: string
  estimated_impact: string
  sentiment_score: number | null
  // Link to the original source page - null when the feed gave no
  // per-event link (the backend never invents a homepage link).
  url: string | null
  // Short description from the source (news articles); optional context.
  context?: string | null
}

export type PrioritizedHazard = {
  id: string
  hazard_type: string
  location_name: string
  alert_level: string
  source: string
  timestamp: string
  priority_score: number
  priority_label: "Critical" | "High" | "Moderate" | "Low"
  // Human-in-the-loop state, merged in by the backend (see app/priority.py).
  severity_overridden: boolean
  status: "active" | "dismissed"
  validated: boolean
  reviewed_by: string | null
  url: string | null
}

export type IncidentNoteRecord = {
  id: number
  hazard_id: string
  note_type: "response_log" | "lesson_learned" | "impact_record"
  content: string
  affected_infrastructure: string | null
  responding_organisation: string | null
  created_by: string
  created_at: string
}

export type AlertItem = {
  id: string
  hazard_type: string
  location_name: string
  alert_level: "Green" | "Orange" | "Red"
  source: string
  timestamp: string
  priority_score: number
  priority_label: "Critical" | "High" | "Moderate" | "Low"
  url: string | null
  /** Channels this alert has been pushed out on, e.g. ["telegram", "email"]. */
  notified_channels: AlertChannel[]
  notified_at: string | null
}

export type AlertChannel = "telegram" | "email"

export type AlertConfig = {
  telegram_configured: boolean
  email_configured: boolean
  email_recipient_count: number
  min_level: string
}

export type StatusInfo = { status: string; active_hazard_count: number; last_data_update: string | null }

export type ReportRecord = {
  id: number
  title: string
  report_type: string
  scope: string | null
  content: string
  ai_included: boolean
  generated_by: string
  created_at: string
}

export type AuditEntry = {
  id: number
  actor_name: string
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export type TrendPoint = { date: string } & Record<string, number | string>

export type TopRegion = { region: string; count: number }

export type IntelligenceBrief = {
  query: string
  role: string
  structured_brief: {
    executive_summary: string
    key_impacts: string[]
    recommendations: string[]
    confidence: number
  } | null
  raw_output: string
  schema_valid: boolean
  sources: { id: string; summary: string; metadata: Record<string, unknown>; distance: number | null }[]
  grounding_score: number
  numbers_grounded: boolean
  domain_constraints_ok: boolean
  alert_triggered: boolean
}

// The date window the dashboard's range picker sends: `days` (last N days) or
// an explicit `since` (inclusive) / `until` (exclusive) pair. Empty = all time.
export type WindowQuery = { days?: number; since?: string; until?: string }

function windowParams(window?: WindowQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (window?.days) out.days = window.days
  if (window?.since) out.since = window.since
  if (window?.until) out.until = window.until
  return out
}

export async function fetchHazards(limit = 1000, window?: WindowQuery): Promise<HazardEvent[]> {
  return apiFetch<HazardEvent[]>("/api/hazards", { limit, ...windowParams(window) })
}

export async function fetchPrioritized(limit = 5, window?: WindowQuery): Promise<PrioritizedHazard[]> {
  return apiFetch<PrioritizedHazard[]>("/api/hazards/prioritized", { limit, ...windowParams(window) })
}

export async function fetchTrends(days = 30): Promise<TrendPoint[]> {
  return apiFetch<TrendPoint[]>("/api/analytics/trends", { days })
}

// With no window the backend defaults to 30 days, so "all time" asks for ~10 years.
export async function fetchTopRegions(window: WindowQuery | undefined, limit = 10): Promise<TopRegion[]> {
  const params = windowParams(window)
  return apiFetch<TopRegion[]>("/api/analytics/top-regions", {
    limit,
    ...(Object.keys(params).length ? params : { days: 3650 }),
  })
}

export async function fetchStatus(): Promise<StatusInfo> {
  return apiFetch<StatusInfo>("/")
}

export async function fetchBrief(query: string, nResults = 5, role = "analyst"): Promise<IntelligenceBrief> {
  return apiFetch<IntelligenceBrief>("/api/intelligence/brief", { query, n_results: nResults, role })
}

async function apiPost<T = void>(path: string, body: unknown): Promise<T> {
  const url = new URL(path, API_BASE_URL)
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) {
    // FastAPI puts a human-readable reason in {"detail": "..."} - surface it.
    const detail = await res.json().then((j) => j?.detail).catch(() => null)
    throw new Error(typeof detail === "string" ? detail : `Request failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json().catch(() => undefined)) as T
}

export async function postReview(hazardId: string, decision: "confirm" | "dismiss", actor: string): Promise<void> {
  await apiPost(`/api/incidents/${encodeURIComponent(hazardId)}/review`, { decision, actor })
}

export async function postSeverityOverride(hazardId: string, severity: number, actor: string): Promise<void> {
  await apiPost(`/api/incidents/${encodeURIComponent(hazardId)}/severity`, { severity, actor })
}

export async function fetchNotes(hazardId: string): Promise<IncidentNoteRecord[]> {
  return apiFetch<IncidentNoteRecord[]>(`/api/incidents/${encodeURIComponent(hazardId)}/notes`)
}

export async function postNote(
  hazardId: string,
  note: {
    note_type: IncidentNoteRecord["note_type"]
    content: string
    affected_infrastructure?: string
    responding_organisation?: string
    created_by: string
  },
): Promise<void> {
  await apiPost(`/api/incidents/${encodeURIComponent(hazardId)}/notes`, note)
}

export async function fetchAlerts(minLevel = "Orange", limit = 50): Promise<AlertItem[]> {
  return apiFetch<AlertItem[]>("/api/alerts", { min_level: minLevel, limit })
}

export async function fetchAlertConfig(): Promise<AlertConfig> {
  return apiFetch<AlertConfig>("/api/alerts/config")
}

export async function postAlertTest(channel: AlertChannel): Promise<void> {
  await apiPost("/api/alerts/test", { channel })
}

export async function fetchReports(limit = 50): Promise<ReportRecord[]> {
  return apiFetch<ReportRecord[]>("/api/reports", { limit })
}

export async function postReport(
  reportType: "situation" | "executive" | "regional",
  scope: string | undefined,
  actor: string,
): Promise<ReportRecord> {
  return apiPost<ReportRecord>("/api/reports", { report_type: reportType, scope: scope ?? null, actor })
}

export async function fetchAuditLog(limit = 60): Promise<AuditEntry[]> {
  return apiFetch<AuditEntry[]>("/api/audit-log", { limit })
}

// --- Data shaping: our backend's vocabulary -> the UI's expected vocabulary ---
// The UI was originally built against a different data model (clustered,
// LLM-synthesized "incidents" with a fixed category taxonomy). Our
// backend's hazard_type values don't match that taxonomy directly, so
// this maps between them. Unmapped hazard_types fall back to "other",
// which the UI already renders gracefully (see lib/format.ts).

const HAZARD_TYPE_TO_CATEGORY: Record<string, string> = {
  earthquake: "natural_disaster",
  volcano: "natural_disaster",
  flood: "natural_disaster",
  drought: "natural_disaster",
  wildfire: "natural_disaster",
  cyclone: "severe_weather",
  extreme_temp: "severe_weather",
  heavy_rain: "severe_weather",
  public_unrest: "civil_unrest",
  armed_conflict: "armed_conflict",
}

export function toCategory(hazardType: string): string {
  return HAZARD_TYPE_TO_CATEGORY[hazardType] ?? "other"
}

export function toTitle(hazardType: string, locationName: string): string {
  const label = hazardType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return `${label} — ${locationName}`
}

export function toSeverityLabel(priorityLabel: string): "critical" | "high" | "moderate" | "low" {
  return priorityLabel.toLowerCase() as "critical" | "high" | "moderate" | "low"
}

"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import {
  fetchAlertConfig,
  fetchAlerts,
  fetchAuditLog,
  fetchBrief,
  fetchHazards,
  fetchNotes,
  fetchPrioritized,
  fetchReports,
  fetchTopRegions,
  fetchStatus,
  postAlertTest,
  postNote,
  postReport,
  postReview,
  postSeverityOverride,
  toCategory,
  toSeverityLabel,
  toTitle,
  type AlertChannel,
  type HazardEvent,
  type IncidentNoteRecord,
  type PrioritizedHazard,
} from "@/lib/api"
import type { Guardrails } from "@/lib/guardrails"
import { formatUtcDate } from "@/lib/format"
import { rangeToWindow, type RangeSelection } from "@/lib/range"

export type IncidentSource = { label: string; url?: string; title: string }

export type IncidentRow = {
  id: string
  title: string
  category: string
  region: string
  country?: string
  severity: number
  severityLabel: "critical" | "high" | "moderate" | "low"
  summary: string | null
  aiSummary: string | null
  aiRecommendations: string[] | null
  sources: IncidentSource[] | null
  confidence: number | null
  sourceCount: number | null
  validated: boolean | null
  validatedBy: string | null
  status: "active" | "dismissed"
  latitude: number | null
  longitude: number | null
  updatedAt: string
  /** Raw feed name (usgs, gdacs, ...). */
  source: string
  /** Link to the original source page. */
  url: string | null
  /** Plain-language fact-check results for the AI summary (detail page only). */
  guardrails: Guardrails | null
}

/** One "contributing source" line: a readable title, "feed · date" underneath,
 *  and a link only if there really is one. */
function sourceEntry(source: string, title: string, when: string | number, url: string | null | undefined): IncidentSource {
  return { label: `${source} · ${formatUtcDate(when)}`, title, url: url ?? undefined }
}

function toIncidentRow(hazard: HazardEvent, priority?: PrioritizedHazard): IncidentRow {
  const title = toTitle(hazard.hazard_type, hazard.location_name)
  return {
    id: hazard.id,
    title,
    category: toCategory(hazard.hazard_type),
    region: hazard.location_name,
    severity: priority?.priority_score ?? 0,
    severityLabel: priority ? toSeverityLabel(priority.priority_label) : "low",
    // No LLM-synthesized per-incident summary at this list-view level yet -
    // that's what the AI Crisis Brief panel (ask-a-question flow) is for.
    // This just shows the raw location text as a placeholder description.
    summary: hazard.location_name,
    aiSummary: null,
    aiRecommendations: null,
    // Its own original source, shown even if the AI brief fails. The link is
    // present only when the feed gave a real per-event URL - never invented.
    sources: [sourceEntry(hazard.source, title, hazard.timestamp, hazard.url)],
    confidence: null,
    // Our backend keeps each hazard as one row per source event, not a
    // cluster of multiple raw signals the way the original data model
    // assumed - so this is always 1, not a real signal count.
    sourceCount: 1,
    // Human-in-the-loop state comes from the backend's incident_reviews
    // table (merged into the prioritized list). A hazard nobody has
    // reviewed simply has no review row: active, not validated.
    validated: priority?.validated ?? false,
    validatedBy: priority?.reviewed_by ?? null,
    status: priority?.status ?? "active",
    latitude: hazard.latitude,
    longitude: hazard.longitude,
    updatedAt: hazard.timestamp,
    source: hazard.source,
    url: hazard.url,
    guardrails: null,
  }
}

/**
 * All incidents, most severe first. `range` is the date-range dropdown
 * value: the backend only returns hazards from that window.
 */
export async function getIncidents(range?: RangeSelection): Promise<IncidentRow[]> {
  const window = range ? rangeToWindow(range) : undefined
  // Fetch the full hazard set and the prioritized (0-100 scored) set in
  // parallel, then merge the priority score back onto every row - not
  // just the top N - so sorting/filtering in the UI has a real severity
  // value to work with everywhere, not only on the top-5 list.
  const [hazards, prioritized] = await Promise.all([fetchHazards(1000, window), fetchPrioritized(1000, window)])
  const priorityById = new Map(prioritized.map((p) => [p.id, p]))

  return hazards
    .map((h) => toIncidentRow(h, priorityById.get(h.id)))
    .sort((a, b) => b.severity - a.severity)
}

export async function getIncident(id: string): Promise<IncidentRow | null> {
  // Always all-time: an incident you open from an old link must not 404
  // just because the dropdown is set to "last 24 hours".
  const incidents = await getIncidents()
  const incident = incidents.find((i) => i.id === id)
  if (!incident) return null

  // Enrich with a real AI-generated brief for this specific incident,
  // rather than leaving the detail page's AI summary/recommendations
  // empty. Query is built from the hazard's own type and location.
  try {
    const brief = await fetchBrief(`${incident.category} situation near ${incident.region}`, 5, "analyst")

    const guardrails: Guardrails = {
      groundingPct: Math.round(brief.grounding_score * 100),
      numbersVerified: brief.numbers_grounded,
      levelsConsistent: brief.domain_constraints_ok,
      formatValid: brief.schema_valid,
      alertWorthy: brief.alert_triggered,
    }

    if (brief.schema_valid && brief.structured_brief) {
      // Turn each record the AI was given back into a readable line (type and
      // place, feed and date) linked to its original page - only when that
      // page is known. The raw summary sentence is no longer used as a title.
      const byId = new Map(incidents.map((i) => [i.id, i]))
      const seen = new Set<string>()
      const sources: IncidentSource[] = []
      for (const s of brief.sources) {
        if (seen.has(s.id)) continue
        seen.add(s.id)
        const known = byId.get(s.id)
        if (known) {
          sources.push(sourceEntry(known.source, known.title, known.updatedAt, known.url))
        } else {
          const ts = typeof s.metadata.timestamp === "number" ? s.metadata.timestamp * 1000 : null
          sources.push({
            label: ts ? `${String(s.metadata.source ?? "source")} · ${formatUtcDate(ts)}` : String(s.metadata.source ?? "source"),
            title: toTitle(String(s.metadata.hazard_type ?? "event"), "unknown location"),
          })
        }
      }
      return {
        ...incident,
        aiSummary: brief.structured_brief.executive_summary,
        aiRecommendations: brief.structured_brief.recommendations,
        sources: sources.length > 0 ? sources : incident.sources,
        confidence: Math.round(brief.structured_brief.confidence * 100),
        sourceCount: sources.length || incident.sourceCount,
        guardrails,
      }
    }
    return { ...incident, guardrails }
  } catch {
    // Brief generation can fail/timeout (LLM calls are slow) - fall back
    // to the plain incident data rather than breaking the whole page.
  }
  return incident
}

export async function getDashboardStats(range?: RangeSelection) {
  const incidents = await getIncidents(range)
  const regions = await fetchTopRegions(range ? rangeToWindow(range) : undefined, 10)

  // Dismissed incidents (analyst-judged false positives) shouldn't inflate
  // the live counts or charts - they stay visible only in "All incidents".
  const active = incidents.filter((i) => i.status === "active")

  const byCategory: Record<string, number> = {}
  for (const i of active) {
    byCategory[i.category] = (byCategory[i.category] ?? 0) + 1
  }
  const byRegion: Record<string, number> = {}
  for (const r of regions) {
    byRegion[r.region] = r.count
  }

  return {
    total: incidents.length,
    active: active.length,
    critical: active.filter((i) => i.severityLabel === "critical").length,
    high: active.filter((i) => i.severityLabel === "high").length,
    validated: incidents.filter((i) => i.validated).length,
    byCategory,
    byRegion,
  }
}

/** When the backend last wrote any data. Feeds are fetched automatically on a
 *  schedule, so this is shown as a status line, not behind a button. */
export async function getLastDataUpdate(): Promise<string | null> {
  try {
    return (await fetchStatus()).last_data_update
  } catch {
    return null // backend unreachable: the page shows "unknown" rather than failing
  }
}

// --- Human-in-the-loop (wired to the backend's /review, /severity, /audit-log) ---

async function currentActorName(): Promise<string> {
  // Until real login exists (RBAC milestone), this is the stub "Operator".
  // The name is sent with each decision so the audit log records who acted.
  const user = await getCurrentUser()
  return user?.name || user?.email || "unknown"
}

function refreshIncidentPages(id: string) {
  revalidatePath("/")
  revalidatePath("/incidents")
  revalidatePath(`/incidents/${id}`)
  revalidatePath("/activity")
  revalidatePath("/alerts")
}

export async function validateIncident(id: string, decision: "confirm" | "dismiss") {
  await postReview(id, decision, await currentActorName())
  refreshIncidentPages(id)
}

export async function setIncidentSeverity(id: string, severity: number) {
  await postSeverityOverride(id, severity, await currentActorName())
  refreshIncidentPages(id)
}

export async function getAuditLog(limit = 30) {
  const entries = await fetchAuditLog(limit)
  // Backend uses snake_case; the Activity page expects camelCase.
  return entries.map((e) => ({
    id: e.id,
    actorName: e.actor_name,
    action: e.action,
    entityType: e.entity_type,
    entityId: e.entity_id,
    details: e.details,
    createdAt: e.created_at,
  }))
}

// --- Incident notes (response logs, lessons learned, impact records) ---

const NOTE_MAX_CHARS = 2000 // same limit the backend enforces

export type IncidentNote = {
  id: number
  noteType: IncidentNoteRecord["note_type"]
  content: string
  affectedInfrastructure: string | null
  respondingOrganisation: string | null
  createdBy: string
  createdAt: string
}

export async function getIncidentNotes(id: string): Promise<IncidentNote[]> {
  const notes = await fetchNotes(id)
  return notes.map((n) => ({
    id: n.id,
    noteType: n.note_type,
    content: n.content,
    affectedInfrastructure: n.affected_infrastructure,
    respondingOrganisation: n.responding_organisation,
    createdBy: n.created_by,
    createdAt: n.created_at,
  }))
}

export async function addIncidentNote(
  id: string,
  input: {
    noteType: IncidentNoteRecord["note_type"]
    content: string
    affectedInfrastructure?: string
    respondingOrganisation?: string
  },
) {
  const content = input.content.trim()
  if (!content) throw new Error("Please write something in the note.")
  if (content.length > NOTE_MAX_CHARS) throw new Error(`Notes can be at most ${NOTE_MAX_CHARS} characters.`)
  await postNote(id, {
    note_type: input.noteType,
    content,
    affected_infrastructure: input.affectedInfrastructure?.trim() || undefined,
    responding_organisation: input.respondingOrganisation?.trim() || undefined,
    created_by: await currentActorName(),
  })
  revalidatePath(`/incidents/${id}`)
  revalidatePath("/activity") // the backend logs every note in the audit trail
}

// --- Alerts (Telegram + email) ---

export async function getAlerts() {
  const [items, config] = await Promise.all([fetchAlerts("Orange", 50), fetchAlertConfig()])
  return {
    items: items.map((a) => ({
      id: a.id,
      title: toTitle(a.hazard_type, a.location_name),
      category: toCategory(a.hazard_type),
      alertLevel: a.alert_level,
      severity: a.priority_score,
      severityLabel: toSeverityLabel(a.priority_label),
      source: a.source,
      timestamp: a.timestamp,
      url: a.url,
      notifiedChannels: a.notified_channels,
      notifiedAt: a.notified_at,
    })),
    telegramConfigured: config.telegram_configured,
    emailConfigured: config.email_configured,
    emailRecipientCount: config.email_recipient_count,
    minLevel: config.min_level,
  }
}

export async function sendTestAlert(channel: AlertChannel) {
  await postAlertTest(channel)
}

// --- Reports ---

export type ReportRow = {
  id: number
  title: string
  reportType: string
  scope: string | null
  content: string
  aiIncluded: boolean
  generatedBy: string
  createdAt: string
}

function toReportRow(r: Awaited<ReturnType<typeof fetchReports>>[number]): ReportRow {
  return {
    id: r.id,
    title: r.title,
    reportType: r.report_type,
    scope: r.scope,
    content: r.content,
    aiIncluded: r.ai_included,
    generatedBy: r.generated_by,
    createdAt: r.created_at,
  }
}

export async function getReports(): Promise<ReportRow[]> {
  return (await fetchReports(50)).map(toReportRow)
}

export async function generateReport(opts: { reportType: "situation" | "executive" | "regional"; scope?: string }) {
  const report = await postReport(opts.reportType, opts.scope, await currentActorName())
  revalidatePath("/reports")
  revalidatePath("/activity")
  return toReportRow(report)
}

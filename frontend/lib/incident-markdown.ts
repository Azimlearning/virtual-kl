// Builds the markdown for exporting ONE incident's AI brief to PDF/DOCX.
// (Whole-report exports reuse the markdown the backend already stored.)
// Same restricted markdown dialect the backend exporter understands
// (app/export.py): headings, "- " bullets, "1. " lines, **bold**, [text](url).

import type { Guardrails } from "@/lib/guardrails"
import { guardrailLines } from "@/lib/guardrails"

type ExportableIncident = {
  title: string
  region: string
  severity: number
  severityLabel: string
  aiSummary: string | null
  aiRecommendations: string[] | null
  confidence: number | null
  updatedAt: string
  sources: { label: string; title: string; url?: string }[] | null
  guardrails: Guardrails | null
}

type ExportableNote = {
  noteType: string
  content: string
  affectedInfrastructure: string | null
  respondingOrganisation: string | null
  createdBy: string
  createdAt: string
}

const NOTE_HEADINGS: Record<string, string> = {
  impact_record: "Impact records",
  response_log: "Response log",
  lesson_learned: "Lessons learned",
}

// Feed text can contain markdown punctuation that would garble the export.
function clean(text: string): string {
  return text.replace(/[\\*_[\]`<>#]/g, "").replace(/\s+/g, " ").trim()
}

function safeUrl(url: string): string {
  return url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20")
}

export function incidentToMarkdown(i: ExportableIncident, notes: ExportableNote[] = []): string {
  const out: string[] = [`# ${clean(i.title)}`, ""]
  const label = i.severityLabel.charAt(0).toUpperCase() + i.severityLabel.slice(1)
  out.push(
    `*${label} priority (${Math.round(i.severity)}/100). ${clean(i.region)}. Last updated ${i.updatedAt.slice(0, 16).replace("T", " ")} UTC. AI-assisted: verify before acting.*`,
    "",
  )

  out.push("## AI situational summary", "")
  out.push(i.aiSummary ? clean(i.aiSummary) : "No AI summary was available for this incident.", "")

  if (i.aiRecommendations && i.aiRecommendations.length > 0) {
    out.push("## Recommended actions", "")
    i.aiRecommendations.forEach((r, n) => out.push(`${n + 1}. ${clean(r)}`))
    out.push("")
  }

  if (i.guardrails) {
    out.push("## Reliability checks", "")
    guardrailLines(i.guardrails).forEach((l) => out.push(`- ${l}`))
    out.push("")
  }

  // Human-written notes, grouped by kind. They are the people's own record,
  // so they are listed as written (only markdown punctuation is neutralised).
  for (const [type, heading] of Object.entries(NOTE_HEADINGS)) {
    const group = notes.filter((n) => n.noteType === type)
    if (group.length === 0) continue
    out.push(`## ${heading}`, "")
    for (const n of group) {
      const extras = [n.affectedInfrastructure && `Infrastructure: ${clean(n.affectedInfrastructure)}`,
        n.respondingOrganisation && `Organisation: ${clean(n.respondingOrganisation)}`].filter(Boolean)
      out.push(`- ${clean(n.content)} (${clean(n.createdBy)}, ${n.createdAt.slice(0, 10)}${extras.length ? "; " + extras.join("; ") : ""})`)
    }
    out.push("")
  }

  if (i.sources && i.sources.length > 0) {
    out.push("## Sources", "")
    for (const s of i.sources) {
      const text = `${clean(s.title).slice(0, 140)} (${clean(s.label)})`
      out.push(s.url ? `- [${text}](${safeUrl(s.url)})` : `- ${text}`)
    }
    out.push("")
  }
  return out.join("\n")
}

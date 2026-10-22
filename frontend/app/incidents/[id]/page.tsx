import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui/card"
import { SeverityBadge } from "@/components/severity-badge"
import { ValidationPanel } from "@/components/validation-panel"
import { GuardrailPanel } from "@/components/guardrail-panel"
import { IncidentNotes } from "@/components/incident-notes"
import { ExportButtons } from "@/components/export-buttons"
import { getIncident, getIncidentNotes } from "@/app/actions/crisis"
import { CATEGORY_LABELS, type SeverityLabel } from "@/lib/format"
import { incidentToMarkdown } from "@/lib/incident-markdown"
import { RelativeTime } from "@/components/relative-time"
import { ArrowLeft, ExternalLink, ListChecks, MapPin, Radio, Sparkles } from "lucide-react"

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const { id } = await params
  // The AI brief is the slow part (a language-model call); notes are quick.
  // Fetching both at once means the notes don't wait in line behind the AI.
  const [incident, notes] = await Promise.all([getIncident(id), getIncidentNotes(id).catch(() => [])])
  if (!incident) notFound()

  const recommendations = incident.aiRecommendations ?? []
  const sources = incident.sources ?? []
  const exportMarkdown = incidentToMarkdown(incident, notes)

  return (
    <AppShell userName={user.name || user.email || "Operator"}>
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-6">
        <Link
          href="/incidents"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to incidents
        </Link>

        <div className="flex flex-col gap-3 border-b border-border pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge label={incident.severityLabel as SeverityLabel} score={incident.severity} />
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
              {CATEGORY_LABELS[incident.category] ?? incident.category}
            </span>
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs capitalize text-muted-foreground">
              {incident.status}
            </span>
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight">{incident.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {incident.region}
              {incident.country ? ` · ${incident.country}` : ""}
            </span>
            <span className="font-mono">{incident.sourceCount ?? 0} sources</span>
            <span className="font-mono">{incident.confidence ?? 0}% confidence</span>
            <span className="inline-flex items-center gap-1">
              Updated <RelativeTime date={incident.updatedAt} />
            </span>
            {incident.url && (
              <a
                href={incident.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open original source
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Card className="gap-2 p-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                AI situational summary
              </p>
              <p className="text-pretty leading-relaxed text-foreground/90">
                {incident.aiSummary || incident.summary || "No summary available."}
              </p>
            </Card>

            {incident.guardrails && <GuardrailPanel g={incident.guardrails} />}

            <Card className="gap-3 p-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ListChecks className="h-4 w-4 text-primary" />
                Recommended actions
              </p>
              {recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recommendations generated.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {recommendations.map((r, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs text-primary">
                        {i + 1}
                      </span>
                      <span className="text-foreground/90">{r}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card className="gap-3 p-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Radio className="h-4 w-4 text-primary" />
                Contributing sources ({sources.length})
              </p>
              <ul className="flex flex-col divide-y divide-border">
                {sources.map((s, i) => (
                  <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-primary group-hover:underline">{s.title}</p>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                        </div>
                        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                      </a>
                    ) : (
                      <div className="min-w-0">
                        <p className="text-sm">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            <IncidentNotes incidentId={incident.id} notes={notes} />
          </div>

          <aside className="flex flex-col gap-5">
            <Card className="sticky top-6 p-5">
              <p className="mb-4 text-sm font-semibold">Analyst controls</p>
              <ValidationPanel
                id={incident.id}
                severity={incident.severity}
                validated={!!incident.validated}
                status={incident.status}
              />
              {incident.validatedBy && (
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  Last action by {incident.validatedBy}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Export this brief</p>
                <p className="text-xs text-muted-foreground">
                  Download the summary, actions, fact-check and sources as a document.
                </p>
                <ExportButtons title={incident.title} markdown={exportMarkdown} />
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

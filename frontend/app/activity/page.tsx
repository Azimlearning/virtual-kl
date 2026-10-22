import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { getAuditLog } from "@/app/actions/crisis"
import { RelativeTime } from "@/components/relative-time"
import { Activity, CheckCircle2, FileText, Gauge, NotebookPen, Satellite, XCircle } from "lucide-react"

const ACTION_META: Record<string, { label: string; icon: typeof Activity; tone: string }> = {
  ingestion_run: { label: "Live ingestion run", icon: Satellite, tone: "text-primary" },
  incident_confirmed: { label: "Incident confirmed", icon: CheckCircle2, tone: "text-[var(--chart-1)]" },
  incident_dismissed: { label: "Incident dismissed", icon: XCircle, tone: "text-muted-foreground" },
  severity_override: { label: "Severity overridden", icon: Gauge, tone: "text-[var(--chart-4)]" },
  note_added: { label: "Response note added", icon: NotebookPen, tone: "text-primary" },
  report_generated: { label: "Report generated", icon: FileText, tone: "text-primary" },
}

export default async function ActivityPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const log = await getAuditLog(60)

  return (
    <AppShell userName={user.name || user.email || "Operator"}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <PageHeader
          title="Activity Log"
          description="Full audit trail of automated ingestion and analyst decisions for accountability."
        />

        {log.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </div>
        ) : (
          <Card className="gap-0 p-0">
            <ul className="flex flex-col divide-y divide-border">
              {log.map((entry) => {
                const meta = ACTION_META[entry.action] ?? {
                  label: entry.action,
                  icon: Activity,
                  tone: "text-muted-foreground",
                }
                const details = entry.details as Record<string, unknown> | null
                return (
                  <li key={entry.id} className="flex items-start gap-3 p-4">
                    <div className={`mt-0.5 ${meta.tone}`}>
                      <meta.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.actorName ?? "system"}
                        {entry.action === "ingestion_run" && details
                          ? ` · ${details.signalsCollected ?? 0} signals, ${details.incidentsCreated ?? 0} new`
                          : ""}
                        {entry.action === "note_added" && details?.note_type
                          ? ` · ${String(details.note_type).replace(/_/g, " ")}`
                          : ""}
                        {entry.action === "severity_override" && details
                          ? ` · set to ${details.severity ?? "?"}${details.previous != null ? ` (was ${details.previous})` : ""}`
                          : ""}
                      </p>
                      {entry.entityType === "hazard" && entry.entityId && (
                        <Link
                          href={`/incidents/${entry.entityId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View incident
                        </Link>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <RelativeTime date={entry.createdAt} />
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

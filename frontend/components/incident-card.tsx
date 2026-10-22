import Link from "next/link"
import { Card } from "@/components/ui/card"
import { SeverityBadge } from "@/components/severity-badge"
import { CATEGORY_LABELS, type SeverityLabel } from "@/lib/format"
import { RelativeTime } from "@/components/relative-time"
import { CheckCircle2, MapPin, Layers, ArrowUpRight } from "lucide-react"

export type IncidentSummary = {
  id: string
  title: string
  category: string
  region: string
  severity: number
  severityLabel: string
  summary: string | null
  confidence: number | null
  sourceCount: number | null
  validated: boolean | null
  status?: string
  updatedAt: Date | string
}

export function IncidentCard({ incident }: { incident: IncidentSummary }) {
  return (
    <Link href={`/incidents/${incident.id}`} className="group block">
      <Card className="gap-0 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge label={incident.severityLabel as SeverityLabel} score={incident.severity} />
            {incident.status === "dismissed" && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                Dismissed
              </span>
            )}
            {incident.validated && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--chart-1)]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Validated
              </span>
            )}
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </div>

        <h3 className="mt-2 text-pretty text-sm font-semibold leading-snug">{incident.title}</h3>
        {incident.summary && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{incident.summary}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {incident.region}
          </span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {CATEGORY_LABELS[incident.category] ?? incident.category}
          </span>
          <span className="font-mono">{incident.sourceCount ?? 0} sources</span>
          <span className="font-mono">{incident.confidence ?? 0}% conf.</span>
          <RelativeTime date={incident.updatedAt} className="ml-auto" />
        </div>
      </Card>
    </Link>
  )
}

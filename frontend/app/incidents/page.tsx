import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { IncidentFeed } from "@/components/incident-feed"
import { RangeSelect } from "@/components/range-select"
import { getIncidents } from "@/app/actions/crisis"
import { parseRange, rangeLabel } from "@/lib/range"

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const range = parseRange(await searchParams)
  const incidents = await getIncidents(range)

  const list = incidents.map((i) => ({
    id: i.id,
    title: i.title,
    category: i.category,
    region: i.region,
    severity: i.severity,
    severityLabel: i.severityLabel,
    summary: i.summary,
    confidence: i.confidence,
    sourceCount: i.sourceCount,
    validated: i.validated,
    status: i.status,
    updatedAt: i.updatedAt,
  }))

  return (
    <AppShell userName={user.name || user.email || "Operator"}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <PageHeader
          title="All Incidents"
          description={`Every tracked incident across all sources, severities, and statuses. Showing: ${rangeLabel(range)}.`}
          actions={<RangeSelect value={range} />}
        />
        <IncidentFeed incidents={list} />
      </div>
    </AppShell>
  )
}

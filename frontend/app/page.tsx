import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { StatCards } from "@/components/stat-cards"
import { LiveStatus } from "@/components/live-status"
import { IncidentFeed } from "@/components/incident-feed"
import { CategoryChart } from "@/components/category-chart"
import { RegionChart } from "@/components/region-chart"
import { CrisisMap } from "@/components/crisis-map"
import { RangeSelect } from "@/components/range-select"
import { parseRange, rangeLabel } from "@/lib/range"
import { getIncidents, getDashboardStats, getLastDataUpdate } from "@/app/actions/crisis"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  // ?range=24h|7d|30d|all, or ?from=YYYY-MM-DD&to=YYYY-MM-DD, from the date picker
  // (anything unrecognised = all time).
  const range = parseRange(await searchParams)

  const [incidents, stats, lastUpdate] = await Promise.all([
    getIncidents(range),
    getDashboardStats(range),
    getLastDataUpdate(),
  ])

  const activeIncidents = incidents.filter((i) => i.status === "active")

  // Top 5 highest-severity active incidents (getIncidents returns them sorted).
  const priority = activeIncidents.slice(0, 5).map((i) => ({
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
    updatedAt: i.updatedAt,
  }))

  const mapIncidents = activeIncidents.map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      region: i.region,
      severity: i.severity,
      severityLabel: i.severityLabel as "critical" | "high" | "moderate" | "low",
      latitude: i.latitude,
      longitude: i.longitude,
    }))

  return (
    <AppShell userName={user.name || user.email || "Operator"}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-6">
        <PageHeader
          title="Crisis Overview"
          description={`Live situational awareness fused from multiple open intelligence sources and synthesized by AI. Showing: ${rangeLabel(range)}.`}
          actions={<RangeSelect value={range} />}
        />

        <LiveStatus lastUpdate={lastUpdate} />
        <StatCards stats={stats} />

        <CrisisMap incidents={mapIncidents} />

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="flex flex-col gap-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Top 5 priority incidents
              </h2>
              <Link
                href="/incidents"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all {activeIncidents.length} active
              </Link>
            </div>
            <IncidentFeed incidents={priority} />
          </section>

          <aside className="flex flex-col gap-4">
            <CategoryChart data={stats.byCategory} />
            <RegionChart data={stats.byRegion} />
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

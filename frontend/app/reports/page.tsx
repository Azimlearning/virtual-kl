import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { ReportGenerator } from "@/components/report-generator"
import { ReportList } from "@/components/report-list"
import { getReports } from "@/app/actions/crisis"

export default async function ReportsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const reports = await getReports()

  return (
    <AppShell userName={user.name || user.email || "Operator"}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <PageHeader
          title="Reports"
          description="Generate AI-written operational reports from current active incidents and review past briefings."
        />
        <ReportGenerator />
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Report history</h2>
          <ReportList
            reports={reports.map((r) => ({
              id: r.id,
              title: r.title,
              reportType: r.reportType,
              scope: r.scope,
              content: r.content,
              aiIncluded: r.aiIncluded,
              generatedBy: r.generatedBy,
              createdAt: r.createdAt,
            }))}
          />
        </div>
      </div>
    </AppShell>
  )
}

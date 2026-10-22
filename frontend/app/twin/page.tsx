import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { TwinView } from "@/components/kl/twin-view"
import { getSnapshot } from "@/lib/kl/snapshot"

export const dynamic = "force-dynamic"
export const metadata = { title: "KL Twin sandbox" }

export default async function TwinPage() {
  const snap = await getSnapshot()
  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <PageHeader
          eyebrow="03 · Twin sandbox"
          title="KL Twin sandbox"
          description="A 3D twin of Kuala Lumpur with thousands of simulated residents. Replay the real October haze or the live forecast, change when and how a warning goes out, and watch who protects themselves in time. Operators rehearse; planners compare options. Everything on this page is simulated."
        />
        <TwinView
          series={snap.series}
          adjusted={snap.adjusted}
          nowIndex={snap.nowIndex}
          stations={snap.stations}
          floodStations={snap.floodStations}
        />
      </div>
    </AppShell>
  )
}

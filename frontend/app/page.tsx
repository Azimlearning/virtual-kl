import { AppShell } from "@/components/app-shell"
import { TwinView } from "@/components/kl/twin-view"
import { FreshnessChip, LevelBadge } from "@/components/kl/ui"
import { levelFromIndex, whenLabel } from "@/lib/kl/scoring"
import { forecastFacts, getSnapshot } from "@/lib/kl/snapshot"

export const dynamic = "force-dynamic"
export const metadata = { title: { absolute: "Virtual KL: rehearse the city's response" } }

export default async function HomePage() {
  const snap = await getSnapshot()
  const { apiNow, hottest, peak, peakTime } = forecastFacts(snap)
  const level = levelFromIndex(Math.max(apiNow ?? 0, peak ?? 0))
  const hasData = apiNow != null || peak != null

  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
        <section className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 max-w-3xl">
            <p className="eyebrow mb-3 flex items-center gap-2.5 text-primary">
              <span aria-hidden className="h-px w-8 bg-primary/60" />
              KL Twin · simulated residents, real haze, an agent that acts first
            </p>
            <h1 className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight md:text-5xl">
              Rehearse Kuala Lumpur&apos;s haze response before it arrives.
            </h1>
            <p className="mt-3 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
              Thousands of simulated residents move around a township while the real October haze replays. The agent rehearses every option on its own,
              picks one, and tells you what to decide. Change the plan and watch who is protected in time.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-sm md:items-end">
            {hasData ? (
              <>
                <div className="flex items-center gap-2">
                  <LevelBadge level={level} />
                  <span className="text-muted-foreground">
                    {hottest ? `${hottest.name} API ` : "Model "}
                    <strong className="tabular-nums text-foreground">{apiNow ?? "n/a"}</strong>
                    {peak != null && peakTime ? (
                      <>
                        {" "}· peak <span className="tabular-nums">{Math.round(peak)}</span> {whenLabel(peakTime, snap.series[snap.nowIndex].t)}
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 md:justify-end">
                  <FreshnessChip label="DOE" status={snap.status.doe} />
                  <FreshnessChip label="Model" status={snap.status.aq} />
                </div>
              </>
            ) : (
              <p className="rounded-lg border border-watch/40 bg-watch/10 p-2.5 text-xs text-watch">Live air-quality feeds are unavailable right now.</p>
            )}
          </div>
        </section>

        {snap.series.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            The sandbox replays real haze data, and the air-quality feed (Open-Meteo / CAMS) is not responding right now. Reload in a minute; the agent will tell you when the feeds are back.
          </p>
        ) : (
          <TwinView
            series={snap.series}
            adjusted={snap.adjusted}
            nowIndex={snap.nowIndex}
            stations={snap.stations}
            floodStations={snap.floodStations}
          />
        )}
      </div>
    </AppShell>
  )
}

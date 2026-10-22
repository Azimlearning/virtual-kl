import Link from "next/link"
import { ArrowRight, Bot, Boxes, CloudRain, Thermometer, Wind } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { ForecastChart } from "@/components/kl/forecast-chart"
import { PulseMap } from "@/components/kl/pulse-map"
import { FreshnessChip, LevelBadge, Stat } from "@/components/kl/ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { metEn } from "@/lib/kl/met"
import { policyFor } from "@/lib/kl/policy"
import { cssColor, dayLabel, doeCategory, levelFromIndex, usAqiCategory, whenLabel } from "@/lib/kl/scoring"
import { forecastFacts, getSnapshot } from "@/lib/kl/snapshot"

export const dynamic = "force-dynamic"
export const metadata = { title: "KL Pulse" }

export default async function PulsePage() {
  const snap = await getSnapshot()
  const { apiNow, hottest, peak, peakTime } = forecastFacts(snap)
  const level = levelFromIndex(Math.max(apiNow ?? 0, peak ?? 0))
  const policy = policyFor(Math.max(apiNow ?? 0, peak ?? 0))
  const today = snap.metDays[0]
  const klWarnings = snap.metWarnings.filter((w) => w.mentionsKL)
  const otherWarnings = snap.metWarnings.filter((w) => !w.mentionsKL)
  const hazeForVeil = apiNow ?? snap.adjusted[snap.nowIndex] ?? null

  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <section className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pt-3">
          <div className="min-w-0 max-w-3xl">
            <p className="eyebrow mb-4 flex items-center gap-2.5 text-primary">
              <span aria-hidden className="h-px w-8 bg-primary/60" />
              01 · Kuala Lumpur live picture
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
              {apiNow == null ? (
                "Live air-quality readings are unavailable."
              ) : (
                <>
                  Air in the city is{" "}
                  <em
                    className="font-medium italic underline decoration-[0.14em] underline-offset-[0.12em]"
                    style={{ textDecorationColor: cssColor(apiNow) }}
                  >
                    {doeCategory(apiNow).toLowerCase()}
                  </em>
                  .
                </>
              )}
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {hottest ? (
                <>
                  <strong className="font-semibold text-foreground">{hottest.name}</strong> reads{" "}
                  <strong className="font-semibold tabular-nums text-foreground">{apiNow}</strong>
                  {" "}on DOE&apos;s API
                </>
              ) : (
                "No DOE reading is available right now"
              )}
              {peak != null && peakTime ? (
                <>
                  ; the model forecast peaks near <span className="tabular-nums">{peak}</span> around{" "}
                  {whenLabel(peakTime, snap.series[snap.nowIndex].t)}.
                </>
              ) : (
                "."
              )}{" "}
              SDP&apos;s KL developments are ringed on the map.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button size="lg" className="cursor-pointer" render={<Link href="/agent" />} nativeButton={false}>
              <Bot className="h-4 w-4" /> Run the agent
            </Button>
            <Button size="lg" variant="outline" className="cursor-pointer" render={<Link href="/twin" />} nativeButton={false}>
              <Boxes className="h-4 w-4" /> Open the twin
            </Button>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <FreshnessChip label="DOE air quality" status={snap.status.doe} />
          <FreshnessChip label="Model forecast" status={snap.status.aq} />
          <FreshnessChip label="Rain ensemble" status={snap.status.ensemble} />
          <FreshnessChip label="MET forecast" status={snap.status.metForecast} />
          <FreshnessChip label="MET warnings" status={snap.status.metWarnings} />
          <FreshnessChip label="JPS flood stations" status={snap.status.jps} />
        </div>

        <PulseMap
          stations={snap.stations}
          floodStations={snap.floodStations}
          hazeIndex={hazeForVeil}
          jpsNote={snap.status.jps.stale ? snap.status.jps.note : undefined}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Highest DOE API now"
            value={<span style={{ color: cssColor(apiNow) }}>{apiNow ?? "—"}</span>}
            sub={
              hottest
                ? `${doeCategory(apiNow)} · ${hottest.name} station · observed ${hottest.observedAt.slice(11, 16)}`
                : "No DOE reading available"
            }
          >
            <div className="mt-1 flex flex-wrap gap-1.5">
              {snap.stations.map((s) => (
                <span key={s.id} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {s.name} {s.api ?? "n/a"}
                </span>
              ))}
            </div>
          </Stat>
          <Stat
            label="48 h forecast peak"
            value={<span style={{ color: cssColor(peak) }}>{peak ?? "—"}</span>}
            sub={
              peak != null && peakTime
                ? `around ${whenLabel(peakTime, snap.series[snap.nowIndex].t)} · ${usAqiCategory(peak)} on the model scale · indicative`
                : "No forecast available"
            }
          />
          <Stat
            label="Rain in next 12 h"
            value={snap.rain ? `${Math.round(snap.rain.anyRain12h * 100)}%` : "—"}
            sub={
              snap.rain
                ? `of ${snap.rain.members} AI-ensemble members give ≥ 1 mm; heavy (≥ 10 mm): ${Math.round(snap.rain.heavyRain12h * 100)}%`
                : "Ensemble unavailable"
            }
          >
            <CloudRain className="h-4 w-4 text-muted-foreground" />
          </Stat>
          <Stat
            label="MET today"
            value={today?.maxTemp != null ? `${today.maxTemp}°C` : "—"}
            sub={today ? `${metEn(today.summary)}${today.morning ? ` · morning: ${metEn(today.morning)}` : ""} · low ${today.minTemp ?? "—"}°C` : "MET forecast unavailable"}
          >
            <Thermometer className="h-4 w-4 text-muted-foreground" />
          </Stat>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Wind className="h-4 w-4" /> Air quality: past 24 h and next 48 h</span>
                <LevelBadge level={level} />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ForecastChart series={snap.series} adjusted={snap.adjusted} nowIndex={snap.nowIndex} doeNow={apiNow} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Grey = Open-Meteo / Copernicus CAMS model, US AQI scale, one value for all of KL (~40 km grid). Teal = the same
                forecast shifted by today&apos;s gap to DOE&apos;s API
                {snap.biasNow != null ? ` (${snap.biasNow >= 0 ? "+" : ""}${snap.biasNow})` : ""}, fading to zero over 48 h — a
                heuristic, so it is <strong>indicative, not official</strong>. The official thresholds apply to DOE&apos;s API.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What this means</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {policy.statements.length === 0 ? (
                <p className="text-muted-foreground">Readings and forecast are at or below 100: no official haze action applies.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {policy.statements.map((s) => (
                    <li key={s.text} className="rounded-lg bg-muted/60 p-2.5">
                      <p>{s.text}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{s.source}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/agent" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                See what the agent would send <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>MET Malaysia 7-day forecast · Kuala Lumpur</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {snap.metDays.slice(0, 7).map((d) => (
                  <div key={d.date} className="rounded-lg bg-muted/60 p-2.5 text-xs">
                    <p className="font-semibold">{dayLabel(`${d.date}T12:00`)}</p>
                    <p className="mt-1 leading-snug" title={d.summary}>{metEn(d.summary)}</p>
                    <p className="mt-1 text-muted-foreground tabular-nums">{d.minTemp ?? "—"}–{d.maxTemp ?? "—"}°C</p>
                    {d.morning && /jerebu|haze/i.test(d.morning) && <p className="mt-1 font-medium text-watch">Haze in the morning</p>}
                  </div>
                ))}
                {snap.metDays.length === 0 && <p className="col-span-full text-sm text-muted-foreground">MET forecast unavailable right now.</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>MET warnings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {klWarnings.length === 0 && (
                <p className="text-muted-foreground">No active MET warning names Kuala Lumpur.</p>
              )}
              {klWarnings.map((w) => (
                <div key={w.issued + w.headline} className="rounded-lg border border-alert/40 bg-alert/10 p-2.5">
                  <p className="font-medium">{w.headline}</p>
                  <p className="text-[11px] text-muted-foreground">issued {w.issued.slice(0, 16).replace("T", " ")}</p>
                </div>
              ))}
              {otherWarnings.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {otherWarnings.length} other active warning{otherWarnings.length === 1 ? "" : "s"} (marine, other states) not shown.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, MessageSquareQuote, Pause, Play, RotateCcw } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { KlMap } from "@/components/kl/kl-map-client"
import { SimulatedBadge } from "@/components/kl/ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FOCUS_AREAS, focusById } from "@/lib/kl/geo"
import { dayLabel, hourLabel } from "@/lib/kl/scoring"
import type { FloodStation, HourPoint, Station } from "@/lib/kl/types"
import { cn } from "@/lib/utils"
import { compare, generatePopulation, makeWindow, positionsAt, stateAt, stateSeries } from "@/lib/twin/engine"
import { CALIBRATION_LABEL, PERSONAS, PERSONA_BY_ID, PRESET_INTERVENTIONS } from "@/lib/twin/personas"
import type { Intervention, MessageQuality, ResidentState } from "@/lib/twin/types"

const SEED = 20261022

const axisTick = (t: string) => (t.slice(11, 13) === "00" ? `${t.slice(8, 10)}/${t.slice(5, 7)}` : hourLabel(t))
const axisFull = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)} ${hourLabel(t)}`

const STATE_RGBA: Record<ResidentState, [number, number, number, number]> = {
  unaware: [120, 140, 170, 205],
  informed: [250, 190, 60, 235],
  protected: [60, 205, 130, 240],
  exposed: [240, 70, 70, 250],
}
const STATE_LABEL: Record<ResidentState, string> = {
  unaware: "Not yet aware",
  informed: "Informed, not protected",
  protected: "Protected (changed plans)",
  exposed: "Outdoors in the haze, unprotected",
}
const STATE_HEX: Record<ResidentState, string> = {
  unaware: "#788caa",
  informed: "#fabe3c",
  protected: "#3ccd82",
  exposed: "#f04646",
}

type Props = {
  series: HourPoint[]
  adjusted: (number | null)[]
  nowIndex: number
  stations: Station[]
  floodStations: FloodStation[]
}

type Answer = { answer: string; source: "claude" | "template"; persona: string }

export function TwinView({ series, adjusted, nowIndex, stations }: Props) {
  const [focusId, setFocusId] = useState("kl-east")
  const [mode, setMode] = useState<"replay" | "forecast">("replay")
  const [ivId, setIvId] = useState("complete-6h")
  const [customLead, setCustomLead] = useState(3)
  const [customMsg, setCustomMsg] = useState<MessageQuality>("complete")
  const [customSite, setCustomSite] = useState(false)
  const [popSize, setPopSize] = useState(2000)
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [question, setQuestion] = useState("Why didn't you change your plans?")
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const focus = focusById(focusId)
  const times = useMemo(() => series.map((p) => p.t), [series])
  const values = useMemo(() => (mode === "forecast" ? adjusted : series.map((p) => p.usAqi)), [mode, adjusted, series])
  const win = useMemo(() => makeWindow(times, values, mode, nowIndex), [times, values, mode, nowIndex])
  const pop = useMemo(() => generatePopulation(focus, popSize, SEED), [focus, popSize])

  const custom: Intervention = useMemo(
    () => ({ id: "custom", label: `Custom: ${customMsg} advisory, ${customLead} h before${customSite ? " + site-manager action" : ""}`, leadHours: customLead, message: customMsg, siteAction: customSite }),
    [customLead, customMsg, customSite],
  )
  const interventions = useMemo(() => [...PRESET_INTERVENTIONS, custom], [custom])
  const results = useMemo(() => compare(pop, win, interventions, SEED), [pop, win, interventions])
  const sel = results.find((r) => r.outcome.intervention.id === ivId) ?? results[0]
  const baseline = results[0]
  const series2 = useMemo(() => stateSeries(pop, sel.outcome, win, SEED), [pop, sel, win])

  // reset the playhead when the scenario changes
  useEffect(() => {
    setHour(0)
    setPlaying(false)
    setSelectedId(null)
    setAnswer(null)
  }, [focusId, mode, popSize])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setHour((h) => {
        if (h + 1 >= win.values.length) {
          setPlaying(false)
          return h
        }
        return h + 1
      })
    }, 380)
    return () => clearInterval(id)
  }, [playing, win.values.length])

  const residents = useMemo(
    () => pop.map((r) => ({ id: r.id, lon: r.lon, lat: r.lat, label: PERSONA_BY_ID[r.persona].label })),
    [pop],
  )
  const versionRef = useRef(0)
  const { colors, positions, version, counts } = useMemo(() => {
    const c = new Uint8Array(pop.length * 4)
    const counts: Record<ResidentState, number> = { unaware: 0, informed: 0, protected: 0, exposed: 0 }
    for (let i = 0; i < pop.length; i++) {
      const st = stateAt(pop[i], sel.outcome, win, hour, SEED)
      counts[st]++
      const col = STATE_RGBA[st]
      c[i * 4] = col[0]
      c[i * 4 + 1] = col[1]
      c[i * 4 + 2] = col[2]
      c[i * 4 + 3] = col[3]
    }
    versionRef.current += 1
    return { colors: c, positions: positionsAt(pop, win, hour), version: versionRef.current, counts }
  }, [pop, sel, win, hour])

  const chartRows = useMemo(
    () =>
      win.times.map((t, i) => ({
        label: t,
        aqi: Math.round(win.values[i]),
        ...series2[i],
      })),
    [win, series2],
  )
  const hourText = `${dayLabel(win.times[hour] ?? win.times[0])} · ${hourLabel(win.times[hour] ?? win.times[0])}`
  const aqiNow = Math.round(win.values[hour] ?? 0)

  const bars = results.map((r) => ({
    id: r.outcome.intervention.id,
    label: r.outcome.intervention.label,
    exposure: Math.round(r.summary.meanExposureHours * 100) / 100,
    early: Math.round(r.summary.actedBeforeEventPct * 10) / 10,
  }))
  const reduction =
    baseline.summary.meanExposureHours > 0
      ? Math.round((100 * (baseline.summary.meanExposureHours - sel.summary.meanExposureHours)) / baseline.summary.meanExposureHours)
      : 0

  const selectedResident = selectedId != null ? pop[selectedId] : null
  const selectedPersona = selectedResident ? PERSONA_BY_ID[selectedResident.persona] : null
  const selectedState = selectedResident ? stateAt(selectedResident, sel.outcome, win, hour, SEED) : null

  async function ask(q: string) {
    if (!selectedResident) return
    setAsking(true)
    setAskError(null)
    try {
      const informed = sel.outcome.informedHour[selectedResident.id]
      const res = await fetch("/api/twin/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: selectedResident.persona,
          channel: selectedResident.channel,
          trust: selectedResident.trust,
          informedHoursBeforeEvent: informed >= 0 && win.eventStart >= 0 ? win.eventStart - informed : null,
          acted: sel.outcome.actHour[selectedResident.id] >= 0,
          exposureHours: sel.outcome.exposure[selectedResident.id],
          intervention: sel.outcome.intervention.label,
          message: sel.outcome.intervention.leadHours == null ? "none" : sel.outcome.intervention.message,
          siteManaged: sel.outcome.siteHour[selectedResident.id] >= 0,
          question: q,
        }),
      })
      if (!res.ok) throw new Error(`Interview failed (HTTP ${res.status})`)
      setAnswer((await res.json()) as Answer)
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "Interview failed")
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SimulatedBadge>Simulated · planning tool, not evidence of real outcomes</SimulatedBadge>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">{CALIBRATION_LABEL}</span>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">Resident positions are illustrative, not addresses</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div className="relative">
            <KlMap
              mode="twin"
              stations={stations}
              focus={focus}
              residents={residents}
              residentColors={colors}
              residentPositions={positions}
              colorsVersion={version}
              selectedResidentId={selectedId}
              onPickResident={(id) => {
                setSelectedId(id)
                setAnswer(null)
              }}
              hazeIndex={aqiNow}
              className="h-[600px]"
            />
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
              <div className="rounded-lg bg-background/85 px-3 py-2 shadow ring-1 ring-foreground/10 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{win.kind === "replay" ? "Replay" : "Forecast"} · {focus.name}</p>
                <p className="text-lg font-semibold tabular-nums">{hourText}</p>
                <p className="text-xs text-muted-foreground">
                  Model AQI <span className="font-semibold text-foreground tabular-nums">{aqiNow}</span>
                  {win.eventStart >= 0 && hour >= win.eventStart ? " · above 100" : ""}
                </p>
              </div>
              <div className="rounded-lg bg-background/85 px-3 py-2 text-xs shadow ring-1 ring-foreground/10 backdrop-blur">
                {(Object.keys(STATE_LABEL) as ResidentState[]).map((k) => (
                  <p key={k} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATE_HEX[k] }} />
                      {STATE_LABEL[k]}
                    </span>
                    <span className="tabular-nums font-semibold">{counts[k].toLocaleString("en-GB")}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
            <Button size="icon" variant="outline" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => { setHour(0); setPlaying(false) }} aria-label="Restart">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <input
              type="range"
              min={0}
              max={Math.max(0, win.values.length - 1)}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="h-2 flex-1 accent-primary"
              aria-label="Time scrubber"
            />
            <span className="w-28 text-right text-xs tabular-nums text-muted-foreground">
              {win.eventStart >= 0 ? `event starts h+${win.eventStart}` : "no event in window"}
            </span>
          </div>
          {win.eventStart < 0 && (
            <p className="rounded-lg border border-watch/40 bg-watch/10 p-3 text-sm text-watch">
              No hour above 100 in this window, so there is nothing to rehearse. Try the replay.
            </p>
          )}
          {win.startsAbove && (
            <p className="rounded-lg border border-watch/40 bg-watch/10 p-3 text-sm text-watch">
              The event is already under way at the start of this window, so every lead time collapses to &quot;now&quot;; only message quality changes the result.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Scenario</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Where in KL</span>
                <select value={focusId} onChange={(e) => setFocusId(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2">
                  {FOCUS_AREAS.map((f) => (
                    <option key={f.id} value={f.id} className="bg-card">
                      {f.name}
                      {f.kind === "sdp" ? " (SDP)" : ""}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] leading-snug text-muted-foreground">{focus.blurb}</span>
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Haze scenario</span>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5 text-xs">
                  {([["replay", "Replay: real Oct haze"], ["forecast", "Live 48 h forecast"]] as const).map(([m, l]) => (
                    <button key={m} onClick={() => setMode(m)} className={cn("rounded-md px-2 py-1.5 font-medium", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                      {l}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] leading-snug text-muted-foreground">{win.label}. Model values, not DOE readings.</span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Synthetic residents</span>
                <select value={popSize} onChange={(e) => setPopSize(Number(e.target.value))} className="h-8 rounded-lg border border-input bg-transparent px-2">
                  {[1000, 2000, 3000].map((n) => (
                    <option key={n} value={n} className="bg-card">{n.toLocaleString("en-GB")}</option>
                  ))}
                </select>
              </label>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Intervention — what do we do?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {interventions.map((iv) => (
                <label key={iv.id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-[13px] leading-snug", ivId === iv.id ? "border-primary bg-primary/10" : "border-border")}>
                  <input type="radio" name="iv" checked={ivId === iv.id} onChange={() => setIvId(iv.id)} className="mt-0.5 accent-primary" />
                  <span>{iv.label}</span>
                </label>
              ))}
              {ivId === "custom" && (
                <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-2.5 text-xs">
                  <label className="flex items-center justify-between gap-2">
                    Lead time: {customLead} h before
                    <input type="range" min={0} max={24} value={customLead} onChange={(e) => setCustomLead(Number(e.target.value))} className="w-32 accent-primary" />
                  </label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5">
                    {(["generic", "complete"] as const).map((m) => (
                      <button key={m} onClick={() => setCustomMsg(m)} className={cn("rounded-md px-2 py-1 font-medium", customMsg === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={customSite} onChange={(e) => setCustomSite(e.target.checked)} className="accent-primary" />
                    Also notify site managers (outdoor crews)
                  </label>
                </div>
              )}
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                <Metric label="Mean time exposed" value={`${sel.summary.meanExposureHours.toFixed(2)} h`} sub="outdoors above 100, per resident" />
                <Metric label="vs no warning" value={ivId === "baseline" ? "—" : `${reduction >= 0 ? "−" : "+"}${Math.abs(reduction)}%`} good={reduction > 0} />
                <Metric label="Acted before event" value={`${sel.summary.actedBeforeEventPct.toFixed(0)}%`} />
                <Metric label="Ever informed" value={`${sel.summary.informedPct.toFixed(0)}%`} />
                {sel.summary.siteManagedPct > 0 && <Metric label="Site-managed" value={`${sel.summary.siteManagedPct.toFixed(1)}%`} sub="residents whose site manager acted" />}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compare interventions · mean hours exposed per resident</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
                  <YAxis type="category" dataKey="label" width={190} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.7} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="exposure" name="Hours exposed" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {bars.map((b) => (
                      <Cell key={b.id} fill={b.id === sel.outcome.intervention.id ? "var(--primary)" : "var(--muted-foreground)"} fillOpacity={b.id === sel.outcome.intervention.id ? 1 : 0.35} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Lower is better. Differences come only from the illustrative persona parameters; they show <em>how</em> timing and message quality interact, not real-world effect sizes.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Residents over time · {sel.outcome.intervention.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ left: -12, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="label" tickFormatter={axisTick} interval={5} minTickGap={22} tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.6} />
                  <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelFormatter={(t) => axisFull(String(t))} />
                  {(["protected", "informed", "unaware", "exposed"] as ResidentState[]).map((k) => (
                    <Area key={k} type="monotone" dataKey={k} name={STATE_LABEL[k]} stackId="1" stroke={STATE_HEX[k]} fill={STATE_HEX[k]} fillOpacity={0.55} isAnimationActive={false} />
                  ))}
                  {chartRows[hour] && <ReferenceLine x={chartRows[hour].label} stroke="currentColor" opacity={0.7} />}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ left: -12, right: 8, top: 4, bottom: 0 }}>
                  <XAxis dataKey="label" hide />
                  <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.6} domain={[0, "auto"]} />
                  <ReferenceLine y={100} stroke="var(--watch)" strokeDasharray="4 4" />
                  <Line dataKey="aqi" name="Model AQI" stroke="var(--primary)" dot={false} strokeWidth={2} isAnimationActive={false} />
                  {chartRows[hour] && <ReferenceLine x={chartRows[hour].label} stroke="currentColor" opacity={0.7} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By persona · {sel.outcome.intervention.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Persona</th>
                    <th className="py-1 pr-2 text-right font-medium">Share</th>
                    <th className="py-1 pr-2 text-right font-medium">Hours exposed</th>
                    <th className="py-1 pr-2 text-right font-medium">no warning</th>
                    <th className="py-1 text-right font-medium">Acted</th>
                  </tr>
                </thead>
                <tbody>
                  {PERSONAS.map((p) => {
                    const s = sel.summary.byPersona.find((x) => x.persona === p.id)
                    const b = baseline.summary.byPersona.find((x) => x.persona === p.id)
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-1.5 pr-2">{p.label}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{Math.round(p.share * 100)}%</td>
                        <td className="py-1.5 pr-2 text-right font-medium tabular-nums">{s?.meanExposureHours.toFixed(2)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{b?.meanExposureHours.toFixed(2)}</td>
                        <td className="py-1.5 text-right tabular-nums">{s?.actedPct.toFixed(0)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Share and every behavioural parameter are illustrative defaults pending the resident survey.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageSquareQuote className="h-4 w-4" /> Interview a simulated resident</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {!selectedResident || !selectedPersona ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground">Click a dot on the map to pick a resident, or pick one here, then ask them why they did what they did.</p>
                <div className="flex flex-wrap gap-1.5">
                  {PERSONAS.map((p) => {
                    const r = pop.find((x) => x.persona === p.id)
                    return r ? (
                      <button key={p.id} onClick={() => { setSelectedId(r.id); setAnswer(null) }} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted">
                        {p.label}
                      </button>
                    ) : null
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-muted/60 p-2.5 text-xs leading-snug">
                  <p className="text-sm font-semibold">
                    {selectedPersona.label} · #{selectedResident.id}
                  </p>
                  <p className="text-muted-foreground">{selectedPersona.blurb}</p>
                  <p className="mt-1">
                    Now: <span className="font-semibold" style={{ color: selectedState ? STATE_HEX[selectedState] : undefined }}>{selectedState ? STATE_LABEL[selectedState] : ""}</span>
                    {" · "}hears things via {selectedResident.channel} · trust {Math.round(selectedResident.trust * 100)}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["Why didn't you change your plans?", "Where did you hear about it?", "What would have made you act earlier?"].map((q) => (
                    <button key={q} onClick={() => { setQuestion(q); void ask(q) }} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted">
                      {q}
                    </button>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void ask(question)
                  }}
                >
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm" />
                  <Button type="submit" size="sm" disabled={asking}>
                    {asking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ask"}
                  </Button>
                </form>
                {askError && <p className="text-xs text-severe">{askError}</p>}
                {answer && (
                  <div className="rounded-lg border border-sim/40 bg-sim/10 p-3">
                    <p className="leading-relaxed">&ldquo;{answer.answer}&rdquo;</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <SimulatedBadge>Simulated resident</SimulatedBadge> answered by {answer.source === "claude" ? "Claude" : "a template (no model key)"}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Metric({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", good && "text-safe")}>{value}</p>
      {sub && <p className="text-[10px] leading-tight text-muted-foreground">{sub}</p>}
    </div>
  )
}

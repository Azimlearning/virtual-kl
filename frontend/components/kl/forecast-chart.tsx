"use client"

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { HourPoint } from "@/lib/kl/types"
import { hourLabel } from "@/lib/kl/scoring"

type Row = { t: string; model: number | null; adjusted: number | null; doe: number | null }

export function ForecastChart({
  series,
  adjusted,
  nowIndex,
  doeNow,
  pastHours = 24,
  futureHours = 48,
}: {
  series: HourPoint[]
  adjusted: (number | null)[]
  nowIndex: number
  doeNow: number | null
  pastHours?: number
  futureHours?: number
}) {
  const from = Math.max(0, nowIndex - pastHours)
  const to = Math.min(series.length, nowIndex + futureHours + 1)
  const rows: Row[] = []
  for (let i = from; i < to; i++) {
    rows.push({
      t: series[i].t,
      model: series[i].usAqi,
      adjusted: adjusted[i] ?? null,
      doe: i === nowIndex ? doeNow : null,
    })
  }
  const nowRow = rows.find((r) => r.t === series[nowIndex]?.t)
  const tick = (t: string) => (t.slice(11, 13) === "00" ? `${t.slice(8, 10)}/${t.slice(5, 7)}` : hourLabel(t))
  const full = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)} ${hourLabel(t)}`

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 20, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
          <XAxis dataKey="t" tickFormatter={tick} interval={5} minTickGap={22} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} allowDecimals={false} tickCount={6} domain={[0, (max: number) => Math.max(250, Math.ceil(max / 50) * 50)]} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ fontWeight: 600 }}
            labelFormatter={(t) => full(String(t))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={100} stroke="var(--watch)" strokeDasharray="4 4" label={{ value: "100 · outdoor activity suspended", fill: "var(--watch)", fontSize: 10, position: "insideTopLeft" }} />
          <ReferenceLine y={200} stroke="var(--severe)" strokeDasharray="4 4" label={{ value: "200 · schools close", fill: "var(--severe)", fontSize: 10, position: "insideTopLeft" }} />
          {nowRow && <ReferenceLine x={nowRow.t} stroke="currentColor" opacity={0.5} label={{ value: "now", fontSize: 10, position: "top" }} />}
          <Line name="Model US AQI (CAMS)" dataKey="model" stroke="var(--muted-foreground)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line name="Bias-adjusted (indicative)" dataKey="adjusted" stroke="var(--primary)" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
          {nowRow && doeNow != null && <ReferenceDot x={nowRow.t} y={doeNow} r={6} fill="var(--severe)" stroke="var(--card)" strokeWidth={2} label={{ value: `DOE ${doeNow}`, fontSize: 11, position: "right", fill: "var(--severe)" }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

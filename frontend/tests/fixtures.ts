import type { HourPoint, Snapshot, Station } from "@/lib/kl/types"

/** Naive local KL hour strings, hourly, starting at 2026-10-12T00:00. */
export function makeTimes(n = 312, startUtcMs = Date.UTC(2026, 9, 12, 0)): string[] {
  return Array.from({ length: n }, (_, i) => new Date(startUtcMs + i * 3600_000).toISOString().slice(0, 13) + ":00")
}

export function station(over: Partial<Station> = {}): Station {
  return {
    id: "CA15W",
    name: "Batu Muda",
    lat: 3.212429,
    lon: 101.682218,
    api: 155,
    category: "Unhealthy",
    pollutant: "PM2.5",
    observedAt: "2026-10-22T20:00:00+08:00",
    isFallback: false,
    ...over,
  }
}

/**
 * A snapshot whose model series is `base` everywhere except a haze bump between
 * `eventFrom` and `eventTo` (indices) at `peak`. nowIndex defaults to 252 (2026-10-22T12:00).
 */
export function makeSnapshot(opts: {
  doe?: number | null
  base?: number
  peak?: number
  eventFrom?: number
  eventTo?: number
  nowIndex?: number
  stale?: boolean
} = {}): Snapshot {
  const times = makeTimes()
  const base = opts.base ?? 60
  const peak = opts.peak ?? 160
  const from = opts.eventFrom ?? 270
  const to = opts.eventTo ?? 290
  const nowIndex = opts.nowIndex ?? 252
  const series: HourPoint[] = times.map((t, i) => {
    const inEvent = i >= from && i <= to
    const v = inEvent ? peak : base
    return { t, pm25: v / 3, usAqi: v }
  })
  const adjusted = series.map((p, i) => (i < nowIndex ? null : p.usAqi))
  const ok = { ok: true, fetchedAt: "2026-10-22T05:00:00.000Z", stale: false }
  return {
    generatedAt: "2026-10-22T05:00:00.000Z",
    nowIndex,
    stations: opts.doe === null ? [] : [station({ api: opts.doe ?? 60, category: "x" })],
    series,
    adjusted,
    biasNow: 0,
    rain: { members: 64, anyRain12h: 0.4, heavyRain12h: 0.1, note: "test" },
    metDays: [],
    metWarnings: [],
    floodStations: [],
    status: {
      doe: ok,
      aq: ok,
      ensemble: ok,
      metForecast: ok,
      metWarnings: ok,
      jps: { ...ok, stale: opts.stale ?? true, observedAt: "2024-02-23T14:45:00+08:00" },
    },
  }
}

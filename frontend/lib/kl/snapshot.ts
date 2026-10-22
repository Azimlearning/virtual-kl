import type { Snapshot } from "./types"
import { biasAdjust, nowIndexIn } from "./scoring"
import { fetchAq, fetchDoe, fetchEnsemble, fetchJps, fetchMetForecast, fetchMetWarnings } from "./sources"

/**
 * One call that gathers everything the pages and the agent need.
 * Never throws: each source reports its own status (see types.Freshness).
 */
export async function getSnapshot(now = new Date()): Promise<Snapshot> {
  const [doe, aq, met, warn, jps] = await Promise.all([
    fetchDoe(),
    fetchAq(),
    fetchMetForecast(),
    fetchMetWarnings(),
    fetchJps(),
  ])

  const times = aq.data.map((p) => p.t)
  const nowIndex = nowIndexIn(times, now)
  const ensemble = await fetchEnsemble((t) => nowIndexIn(t, now))

  // The agent's reference reading: the highest current DOE API in KL.
  const doeNow = doe.data.reduce<number | null>((m, s) => (s.api != null && (m == null || s.api > m) ? s.api : m), null)
  const { adjusted, bias } = biasAdjust(
    aq.data.map((p) => p.usAqi),
    nowIndex,
    doeNow,
  )

  return {
    generatedAt: now.toISOString(),
    nowIndex,
    stations: doe.data,
    series: aq.data,
    adjusted,
    biasNow: bias,
    rain: ensemble.data,
    metDays: met.data,
    metWarnings: warn.data,
    floodStations: jps.data,
    status: {
      doe: doe.status,
      aq: aq.status,
      ensemble: ensemble.status,
      metForecast: met.status,
      metWarnings: warn.status,
      jps: jps.status,
    },
  }
}

/** Highest current DOE API among KL stations. */
export function maxApiNow(s: Snapshot): number | null {
  return s.stations.reduce<number | null>((m, st) => (st.api != null && (m == null || st.api > m) ? st.api : m), null)
}

/** Headline numbers for the Pulse page (the agent computes its own, with more detail). */
export function forecastFacts(s: Snapshot) {
  const apiNow = maxApiNow(s)
  const hottest = s.stations.filter((st) => st.api != null).sort((a, b) => (b.api ?? 0) - (a.api ?? 0))[0] ?? null
  let peak: number | null = null
  let peakIdx = -1
  s.adjusted.forEach((v, i) => {
    if (v != null && (peak == null || v > peak)) {
      peak = v
      peakIdx = i
    }
  })
  return { apiNow, hottest, peak, peakIdx, peakTime: peakIdx >= 0 ? s.series[peakIdx].t : null }
}

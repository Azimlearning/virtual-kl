import type { Level, Station } from "./types"

/** DOE Air Pollutant Index categories (Malaysia). Verified against DOE/The Star on 2026-10-22. */
export function doeCategory(api: number | null): string {
  if (api == null) return "No data"
  if (api <= 50) return "Good"
  if (api <= 100) return "Moderate"
  if (api <= 200) return "Unhealthy"
  if (api <= 300) return "Very Unhealthy"
  return "Hazardous"
}

/** US AQI categories (Open-Meteo's model index is US AQI, not the Malaysian API). */
export function usAqiCategory(aqi: number | null): string {
  if (aqi == null) return "No data"
  if (aqi <= 50) return "Good"
  if (aqi <= 100) return "Moderate"
  if (aqi <= 150) return "Unhealthy for sensitive groups"
  if (aqi <= 200) return "Unhealthy"
  if (aqi <= 300) return "Very unhealthy"
  return "Hazardous"
}

/**
 * Virtual KL's internal alert level (D-08). It reuses the MOE action thresholds
 * (>100 suspend outdoor activity, >200 close schools) as the Orange / Red boundaries.
 * This is our mapping, not an official category.
 */
export function levelFromIndex(x: number | null): Level {
  if (x == null) return "Green"
  if (x > 200) return "Red"
  if (x > 100) return "Orange"
  return "Green"
}

export function maxLevel(a: Level, b: Level): Level {
  const order: Level[] = ["Green", "Orange", "Red"]
  return order[Math.max(order.indexOf(a), order.indexOf(b))]
}

/** RGBA for deck.gl / CSS by index value (DOE-style ramp). */
export function indexColor(x: number | null): [number, number, number, number] {
  if (x == null) return [120, 128, 140, 200]
  if (x <= 50) return [74, 189, 118, 230]
  if (x <= 100) return [236, 201, 75, 230]
  if (x <= 200) return [240, 130, 50, 235]
  if (x <= 300) return [220, 60, 60, 240]
  return [150, 40, 120, 245]
}

export function cssColor(x: number | null): string {
  const [r, g, b] = indexColor(x)
  return `rgb(${r}, ${g}, ${b})`
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function nearestStation(
  lat: number,
  lon: number,
  stations: Station[],
): { station: Station; distanceKm: number } | null {
  let best: { station: Station; distanceKm: number } | null = null
  for (const s of stations) {
    const d = haversineKm(lat, lon, s.lat, s.lon)
    if (!best || d < best.distanceKm) best = { station: s, distanceKm: d }
  }
  return best
}

/**
 * Bias adjustment (heuristic, labelled indicative everywhere it is shown):
 * the model's US AQI and the DOE API measure different things, so we shift the
 * model's forecast by the *current* gap (DOE API minus model US AQI), tapering
 * linearly to zero over `taperHours`. Values before `nowIndex` are left null.
 */
export function biasAdjust(
  usAqi: (number | null)[],
  nowIndex: number,
  doeNow: number | null,
  taperHours = 48,
): { adjusted: (number | null)[]; bias: number | null } {
  const modelNow = usAqi[nowIndex]
  if (doeNow == null || modelNow == null) {
    return { adjusted: usAqi.map((v, i) => (i < nowIndex ? null : v)), bias: null }
  }
  const bias = doeNow - modelNow
  const adjusted = usAqi.map((v, i) => {
    if (i < nowIndex || v == null) return null
    const h = i - nowIndex
    const factor = Math.max(0, 1 - h / taperHours)
    return Math.max(0, Math.round(v + bias * factor))
  })
  return { adjusted, bias }
}

/** First index >= from where value > threshold, or -1. */
export function firstAbove(series: (number | null)[], threshold: number, from = 0): number {
  for (let i = from; i < series.length; i++) {
    const v = series[i]
    if (v != null && v > threshold) return i
  }
  return -1
}

/** First index >= from where value <= threshold after being above, or -1. */
export function firstBackBelow(series: (number | null)[], threshold: number, from = 0): number {
  for (let i = from; i < series.length; i++) {
    const v = series[i]
    if (v != null && v <= threshold) return i
  }
  return -1
}

/** Local KL hour string "YYYY-MM-DDTHH:00" for a Date (KL is UTC+8, no DST). */
export function klHourString(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:00`
}

export function nowIndexIn(times: string[], now: Date): number {
  const key = klHourString(now)
  let idx = -1
  for (let i = 0; i < times.length; i++) {
    if (times[i] <= key) idx = i
    else break
  }
  return Math.max(0, idx)
}

/** "3 PM" style label from a local time string. */
export function hourLabel(t: string): string {
  const h = Number(t.slice(11, 13))
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${ampm}`
}

export function dayLabel(t: string): string {
  const d = new Date(`${t.slice(0, 10)}T12:00:00+08:00`)
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short" }).format(d)
}

/** "9 PM today" / "8 PM tomorrow" / "3 AM on Sat 24 Oct" (or Malay: "9 PM hari ini", "8 PM esok"). */
export function whenLabel(t: string, nowT: string, lang: "en" | "bm" = "en"): string {
  const hour = hourLabel(t)
  const diff = Math.round((Date.parse(`${t.slice(0, 10)}T00:00:00Z`) - Date.parse(`${nowT.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
  if (diff === 0) return lang === "bm" ? `${hour} hari ini` : `${hour} today`
  if (diff === 1) return lang === "bm" ? `${hour} esok` : `${hour} tomorrow`
  return lang === "bm" ? `${hour} pada ${dayLabel(t)}` : `${hour} on ${dayLabel(t)}`
}

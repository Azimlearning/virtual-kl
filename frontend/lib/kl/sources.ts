import { z } from "zod"
import type {
  FloodStation,
  Freshness,
  HourPoint,
  MetDay,
  MetWarning,
  RainProbability,
  Station,
} from "./types"
import { doeCategory } from "./scoring"
import { KL_CENTER } from "./geo"

/**
 * Every fetcher returns { data, status } and never throws: a dead source degrades one card,
 * not the page (plan risk table). Responses are validated with zod before use.
 */
export type Fetched<T> = { data: T; status: Freshness }

const TIMEOUT_MS = 12_000

async function getJson(url: string, revalidate = 300): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "virtual-kl-hackathon/0.1" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`)
  return res.json()
}

function failed<T>(empty: T, err: unknown, note?: string): Fetched<T> {
  return {
    data: empty,
    status: {
      ok: false,
      fetchedAt: new Date().toISOString(),
      stale: true,
      error: err instanceof Error ? err.message : String(err),
      note,
    },
  }
}

function minutesBetween(aIso: string, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - new Date(aIso).getTime()) / 60000))
}

// ---------------------------------------------------------------- DOE (via Haze Monitor)

const DoeSchema = z.object({
  observedAt: z.string(),
  stations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      state: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      api: z.number().nullable(),
      pollutant: z.string().nullable().optional(),
      observedAt: z.string(),
      isFallback: z.boolean().optional(),
    }),
  ),
})

export const DOE_URL = "https://hazemonitor.com/api/air-quality"

export function parseDoe(json: unknown, now = new Date()): Fetched<Station[]> {
  const parsed = DoeSchema.parse(json)
  const stations: Station[] = parsed.stations
    .filter((s) => s.state === "WP Kuala Lumpur")
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.latitude,
      lon: s.longitude,
      api: s.api,
      category: doeCategory(s.api),
      pollutant: s.pollutant ?? null,
      observedAt: s.observedAt,
      isFallback: Boolean(s.isFallback),
    }))
  const newest = stations.map((s) => s.observedAt).sort().at(-1) ?? parsed.observedAt
  const age = minutesBetween(newest, now)
  const carried = stations.filter((s) => s.isFallback).map((s) => s.name)
  return {
    data: stations,
    status: {
      ok: stations.length > 0,
      fetchedAt: now.toISOString(),
      observedAt: newest,
      ageMinutes: age,
      stale: age > 150,
      note:
        "DOE API readings via the third-party Haze Monitor feed (A-06). KL has only two DOE stations." +
        (carried.length ? ` ${carried.join(", ")}: carried over from an earlier hour (no new reading yet).` : ""),
      error: stations.length === 0 ? "No Kuala Lumpur stations in feed" : undefined,
    },
  }
}

export async function fetchDoe(): Promise<Fetched<Station[]>> {
  try {
    return parseDoe(await getJson(DOE_URL, 120))
  } catch (e) {
    return failed([], e, "DOE readings unavailable")
  }
}

// ---------------------------------------------------------------- Open-Meteo air quality

const AqSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    pm2_5: z.array(z.number().nullable()),
    us_aqi: z.array(z.number().nullable()),
  }),
})

export function aqUrl(pastDays = 21, forecastDays = 3): string {
  const { lat, lon } = KL_CENTER
  return (
    "https://air-quality-api.open-meteo.com/v1/air-quality" +
    `?latitude=${lat}&longitude=${lon}&hourly=pm2_5,us_aqi&past_days=${pastDays}&forecast_days=${forecastDays}` +
    "&timezone=Asia%2FKuala_Lumpur"
  )
}

export function parseAq(json: unknown, now = new Date()): Fetched<HourPoint[]> {
  const h = AqSchema.parse(json).hourly
  const points: HourPoint[] = h.time.map((t, i) => ({ t, pm25: h.pm2_5[i] ?? null, usAqi: h.us_aqi[i] ?? null }))
  return {
    data: points,
    status: {
      ok: points.length > 0,
      fetchedAt: now.toISOString(),
      stale: false,
      note: "Open-Meteo / Copernicus CAMS model (~40 km grid): one value for all of KL, US AQI scale — not the Malaysian API.",
    },
  }
}

export async function fetchAq(): Promise<Fetched<HourPoint[]>> {
  try {
    return parseAq(await getJson(aqUrl(), 900))
  } catch (e) {
    return failed([], e, "Model air-quality series unavailable")
  }
}

// ---------------------------------------------------------------- WeatherNext 2 ensemble (rain)

export function ensembleUrl(): string {
  const { lat, lon } = KL_CENTER
  return (
    "https://ensemble-api.open-meteo.com/v1/ensemble" +
    `?latitude=${lat}&longitude=${lon}&hourly=precipitation&models=google_weathernext2_ensemble` +
    "&forecast_days=2&timezone=Asia%2FKuala_Lumpur"
  )
}

/** Share of ensemble members with >= 1 mm / >= 10 mm over the 12 hours from `nowIndex`. */
export function rainProbabilities(
  hourly: Record<string, unknown>,
  nowIndex: number,
): RainProbability | null {
  const keys = Object.keys(hourly).filter((k) => k.startsWith("precipitation_member"))
  if (keys.length === 0) return null
  let any = 0
  let heavy = 0
  for (const k of keys) {
    const arr = hourly[k]
    if (!Array.isArray(arr)) continue
    let sum = 0
    for (let i = nowIndex; i < Math.min(arr.length, nowIndex + 12); i++) {
      const v = arr[i]
      if (typeof v === "number") sum += v
    }
    if (sum >= 1) any++
    if (sum >= 10) heavy++
  }
  return {
    members: keys.length,
    anyRain12h: any / keys.length,
    heavyRain12h: heavy / keys.length,
    note: "Google WeatherNext 2 AI ensemble via Open-Meteo, 0.25° grid, native 6-hourly values spread over hours.",
  }
}

export async function fetchEnsemble(nowIndexOf: (times: string[]) => number): Promise<Fetched<RainProbability | null>> {
  try {
    const json = (await getJson(ensembleUrl(), 1800)) as { hourly?: Record<string, unknown> }
    const hourly = json.hourly
    if (!hourly || !Array.isArray(hourly.time)) throw new Error("Unexpected ensemble response")
    const idx = nowIndexOf(hourly.time as string[])
    const rain = rainProbabilities(hourly, idx)
    return {
      data: rain,
      status: { ok: rain != null, fetchedAt: new Date().toISOString(), stale: false, note: rain?.note },
    }
  } catch (e) {
    return failed(null, e, "Rain-probability ensemble unavailable")
  }
}

// ---------------------------------------------------------------- MET Malaysia via data.gov.my

const MetForecastSchema = z.array(
  z.object({
    location: z.object({ location_id: z.string(), location_name: z.string() }),
    date: z.string(),
    morning_forecast: z.string().nullable().optional(),
    afternoon_forecast: z.string().nullable().optional(),
    night_forecast: z.string().nullable().optional(),
    summary_forecast: z.string().nullable().optional(),
    min_temp: z.number().nullable().optional(),
    max_temp: z.number().nullable().optional(),
  }),
)

export const MET_FORECAST_URL =
  "https://api.data.gov.my/weather/forecast?contains=Kuala%20Lumpur@location__location_name&limit=30"

export function parseMetForecast(json: unknown, now = new Date()): Fetched<MetDay[]> {
  const rows = MetForecastSchema.parse(json).filter((r) => r.location.location_id === "Ds058")
  const days: MetDay[] = rows
    .map((r) => ({
      date: r.date,
      summary: r.summary_forecast ?? "",
      morning: r.morning_forecast ?? "",
      afternoon: r.afternoon_forecast ?? "",
      night: r.night_forecast ?? "",
      minTemp: r.min_temp ?? null,
      maxTemp: r.max_temp ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  return {
    data: days,
    status: {
      ok: days.length > 0,
      fetchedAt: now.toISOString(),
      stale: false,
      note: "MET Malaysia 7-day district forecast for Kuala Lumpur (location Ds058), text in Bahasa Melayu.",
      error: days.length === 0 ? "No Ds058 rows" : undefined,
    },
  }
}

export async function fetchMetForecast(): Promise<Fetched<MetDay[]>> {
  try {
    return parseMetForecast(await getJson(MET_FORECAST_URL, 1800))
  } catch (e) {
    return failed([], e, "MET forecast unavailable")
  }
}

const MetWarningSchema = z.array(
  z.object({
    warning_issue: z.object({ issued: z.string(), title_en: z.string().nullable().optional() }),
    valid_from: z.string().nullable().optional(),
    valid_to: z.string().nullable().optional(),
    heading_en: z.string().nullable().optional(),
    text_en: z.string().nullable().optional(),
    text_bm: z.string().nullable().optional(),
  }),
)

export const MET_WARNING_URL = "https://api.data.gov.my/weather/warning?limit=40"

export function parseMetWarnings(json: unknown, now = new Date()): Fetched<MetWarning[]> {
  const rows = MetWarningSchema.parse(json)
  const nowLocal = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 19) // KL local, naive
  const warnings: MetWarning[] = rows
    .filter((r) => r.valid_to == null || r.valid_to >= nowLocal)
    .filter((r) => (r.heading_en ?? r.warning_issue.title_en ?? "").toLowerCase() !== "no advisory")
    .map((r) => {
      const text = `${r.text_en ?? ""} ${r.text_bm ?? ""}`
      return {
        issued: r.warning_issue.issued,
        validFrom: r.valid_from ?? null,
        validTo: r.valid_to ?? null,
        headline: r.heading_en ?? r.warning_issue.title_en ?? "Warning",
        text: (r.text_en ?? "").slice(0, 600),
        mentionsKL: /kuala lumpur|wilayah persekutuan|w\.?p\.? kuala lumpur/i.test(text),
      }
    })
  return {
    data: warnings,
    status: {
      ok: true,
      fetchedAt: now.toISOString(),
      stale: false,
      note: "MET Malaysia warnings via data.gov.my. Only warnings whose text names Kuala Lumpur are flagged as relevant.",
    },
  }
}

export async function fetchMetWarnings(): Promise<Fetched<MetWarning[]>> {
  try {
    return parseMetWarnings(await getJson(MET_WARNING_URL, 300))
  } catch (e) {
    return failed([], e, "MET warnings unavailable")
  }
}

// ---------------------------------------------------------------- JPS flood stations (STALE)

const JpsSchema = z.array(
  z.object({
    station_id: z.string(),
    station_name: z.string(),
    district: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    water_level_indicator: z.string().nullable().optional(),
    water_level_current: z.number().nullable().optional(),
    water_level_update_datetime: z.string().nullable().optional(),
  }),
)

export const JPS_URL = "https://api.data.gov.my/flood-warning?icontains=Kuala%20Lumpur@state&limit=200"

export function parseJps(json: unknown, now = new Date()): Fetched<FloodStation[]> {
  const rows = JpsSchema.parse(json).filter(
    (r) => /kuala lumpur/i.test(r.state ?? "") && r.latitude != null && r.longitude != null,
  )
  const stations: FloodStation[] = rows.map((r) => {
    const updated = r.water_level_update_datetime ? r.water_level_update_datetime.replace(" ", "T") + "+08:00" : null
    const ageH = updated ? (now.getTime() - new Date(updated).getTime()) / 3600_000 : Infinity
    return {
      id: r.station_id,
      name: r.station_name.trim(),
      district: (r.district ?? "").trim(),
      lat: r.latitude as number,
      lon: r.longitude as number,
      indicator: r.water_level_indicator ?? null,
      level: r.water_level_current ?? null,
      updatedAt: updated,
      stale: ageH > 6,
    }
  })
  const newest = stations.map((s) => s.updatedAt).filter((x): x is string => !!x).sort().at(-1)
  const stale = stations.length === 0 || stations.every((s) => s.stale)
  return {
    data: stations,
    status: {
      ok: stations.length > 0,
      fetchedAt: now.toISOString(),
      observedAt: newest,
      ageMinutes: newest ? minutesBetween(newest, now) : undefined,
      stale,
      note: stale
        ? "JPS water-level readings in this feed are frozen (last update shown). Shown on the map as a greyed layer and NEVER used for decisions (D-22)."
        : "JPS water-level stations via data.gov.my.",
    },
  }
}

export async function fetchJps(): Promise<Fetched<FloodStation[]>> {
  try {
    return parseJps(await getJson(JPS_URL, 1800))
  } catch (e) {
    return failed([], e, "JPS stations unavailable")
  }
}

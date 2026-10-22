import { describe, expect, it } from "vitest"
import { parseAq, parseDoe, parseJps, parseMetForecast, parseMetWarnings, rainProbabilities } from "@/lib/kl/sources"

const NOW = new Date("2026-10-22T12:30:00Z") // 20:30 KL

describe("parseDoe", () => {
  const feed = {
    observedAt: "2026-10-22T20:00:00+08:00",
    stations: [
      { id: "CA15W", name: "Batu Muda", state: "WP Kuala Lumpur", latitude: 3.21, longitude: 101.68, api: 155, pollutant: "PM2.5", observedAt: "2026-10-22T20:00:00+08:00" },
      { id: "CA16W", name: "Cheras", state: "WP Kuala Lumpur", latitude: 3.1, longitude: 101.71, api: 100, pollutant: "PM2.5", observedAt: "2026-10-22T20:00:00+08:00" },
      { id: "CA17W", name: "Putrajaya", state: "WP Putrajaya", latitude: 2.9, longitude: 101.69, api: 151, pollutant: "PM2.5", observedAt: "2026-10-22T20:00:00+08:00" },
      { id: "CA01R", name: "Kangar", state: "Perlis", latitude: 6.4, longitude: 100.2, api: 65, observedAt: "2026-10-22T20:00:00+08:00" },
    ],
  }
  it("keeps only Kuala Lumpur stations and categorises them", () => {
    const r = parseDoe(feed, NOW)
    expect(r.data.map((s) => s.name)).toEqual(["Batu Muda", "Cheras"])
    expect(r.data[0].category).toBe("Unhealthy")
    expect(r.data[1].category).toBe("Moderate")
    expect(r.status.ok).toBe(true)
    expect(r.status.stale).toBe(false)
    expect(r.status.ageMinutes).toBe(30)
  })
  it("notes carried-over readings without calling a fresh feed stale", () => {
    const withFallback = { ...feed, stations: feed.stations.map((s) => (s.id === "CA16W" ? { ...s, isFallback: true } : s)) }
    const r = parseDoe(withFallback, NOW)
    expect(r.status.stale).toBe(false)
    expect(r.status.note).toMatch(/Cheras: carried over/)
    expect(r.data.find((s) => s.name === "Cheras")?.isFallback).toBe(true)
  })
  it("is stale when the newest reading is older than 2.5 hours", () => {
    const later = new Date("2026-10-22T16:00:00Z") // 00:00 KL next day, 4 h after the readings
    expect(parseDoe(feed, later).status.stale).toBe(true)
  })
  it("reports an error when KL has no stations", () => {
    const r = parseDoe({ observedAt: feed.observedAt, stations: [feed.stations[3]] }, NOW)
    expect(r.status.ok).toBe(false)
    expect(r.status.error).toMatch(/Kuala Lumpur/)
  })
  it("rejects malformed JSON via zod", () => {
    expect(() => parseDoe({ nope: true }, NOW)).toThrow()
  })
})

describe("parseAq", () => {
  it("zips hourly arrays into points", () => {
    const r = parseAq({ hourly: { time: ["2026-10-22T00:00", "2026-10-22T01:00"], pm2_5: [10, null], us_aqi: [40, null] } }, NOW)
    expect(r.data).toEqual([
      { t: "2026-10-22T00:00", pm25: 10, usAqi: 40 },
      { t: "2026-10-22T01:00", pm25: null, usAqi: null },
    ])
  })
})

describe("parseMetForecast", () => {
  const row = (id: string, name: string, date: string) => ({
    location: { location_id: id, location_name: name },
    date,
    summary_forecast: "Mendung",
    morning_forecast: "Jerebu",
    afternoon_forecast: "Mendung",
    night_forecast: "Tiada hujan",
    min_temp: 24,
    max_temp: 33,
  })
  it("keeps district Ds058 only and sorts by date", () => {
    const r = parseMetForecast([row("Ds058", "Kuala Lumpur", "2026-10-24"), row("St009", "WP Kuala Lumpur", "2026-10-23"), row("Ds058", "Kuala Lumpur", "2026-10-23")], NOW)
    expect(r.data.map((d) => d.date)).toEqual(["2026-10-23", "2026-10-24"])
    expect(r.data[0].morning).toBe("Jerebu")
  })
})

describe("parseMetWarnings", () => {
  const w = (over: Record<string, unknown>) => ({
    warning_issue: { issued: "2026-10-22T18:00:00", title_en: "Thunderstorms Warning" },
    valid_from: "2026-10-22T17:00:00",
    valid_to: "2026-10-23T00:00:00",
    heading_en: "THUNDERSTORMS WARNING",
    text_en: "Thunderstorms over Selangor and Kuala Lumpur",
    text_bm: "",
    ...over,
  })
  it("drops expired warnings and 'No Advisory', and flags KL mentions", () => {
    const r = parseMetWarnings(
      [
        w({}),
        w({ valid_to: "2026-10-20T00:00:00", heading_en: "OLD" }),
        w({ heading_en: "No Advisory", valid_from: null, valid_to: null }),
        w({ heading_en: "STRONG WINDS", text_en: "Waters of Sabah" }),
      ],
      NOW,
    )
    expect(r.data.map((x) => x.headline)).toEqual(["THUNDERSTORMS WARNING", "STRONG WINDS"])
    expect(r.data[0].mentionsKL).toBe(true)
    expect(r.data[1].mentionsKL).toBe(false)
  })
})

describe("parseJps", () => {
  const s = (over: Record<string, unknown> = {}) => ({
    station_id: "BTU10_",
    station_name: " Sg. Batu di Kg. Batu Muda ",
    district: "Kuala Lumpur",
    state: "WILAYAH PERSEKUTUAN KUALA LUMPUR",
    latitude: 3.216,
    longitude: 101.682,
    water_level_indicator: "NORMAL",
    water_level_current: 38.55,
    water_level_update_datetime: "2024-02-23 14:45:00",
    ...over,
  })
  it("marks a feed frozen in 2024 as stale and says so", () => {
    const r = parseJps([s(), s({ state: "PAHANG", station_id: "x" })], NOW)
    expect(r.data).toHaveLength(1)
    expect(r.data[0].name).toBe("Sg. Batu di Kg. Batu Muda")
    expect(r.data[0].stale).toBe(true)
    expect(r.status.stale).toBe(true)
    expect(r.status.note).toMatch(/NEVER used for decisions/)
  })
  it("treats a fresh reading as live", () => {
    const r = parseJps([s({ water_level_update_datetime: "2026-10-22 19:45:00" })], NOW)
    expect(r.status.stale).toBe(false)
  })
})

describe("rainProbabilities", () => {
  it("counts the share of ensemble members above the thresholds over the next 12 h", () => {
    const hourly = {
      time: Array.from({ length: 24 }, (_, i) => `2026-10-22T${String(i).padStart(2, "0")}:00`),
      precipitation: Array(24).fill(0),
      precipitation_member01: Array(24).fill(0), // dry
      precipitation_member02: Array.from({ length: 24 }, (_, i) => (i === 14 ? 2 : 0)), // >=1 mm
      precipitation_member03: Array.from({ length: 24 }, (_, i) => (i >= 12 && i < 14 ? 6 : 0)), // 12 mm -> heavy
      precipitation_member04: Array.from({ length: 24 }, (_, i) => (i === 3 ? 20 : 0)), // before now -> ignored
    }
    const r = rainProbabilities(hourly, 12)!
    expect(r.members).toBe(4)
    expect(r.anyRain12h).toBe(0.5)
    expect(r.heavyRain12h).toBe(0.25)
  })
  it("returns null with no members", () => {
    expect(rainProbabilities({ time: [], precipitation: [] }, 0)).toBeNull()
  })
})

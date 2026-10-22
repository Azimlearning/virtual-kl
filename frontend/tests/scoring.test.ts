import { describe, expect, it } from "vitest"
import {
  biasAdjust,
  dayLabel,
  doeCategory,
  firstAbove,
  firstBackBelow,
  hourLabel,
  klHourString,
  levelFromIndex,
  maxLevel,
  nearestStation,
  nowIndexIn,
  usAqiCategory,
  whenLabel,
} from "@/lib/kl/scoring"
import { autonomyFor, policyFor } from "@/lib/kl/policy"
import { station } from "./fixtures"

describe("categories and levels", () => {
  it("maps DOE API to Malaysian categories at the boundaries", () => {
    expect(doeCategory(50)).toBe("Good")
    expect(doeCategory(51)).toBe("Moderate")
    expect(doeCategory(100)).toBe("Moderate")
    expect(doeCategory(101)).toBe("Unhealthy")
    expect(doeCategory(200)).toBe("Unhealthy")
    expect(doeCategory(201)).toBe("Very Unhealthy")
    expect(doeCategory(301)).toBe("Hazardous")
    expect(doeCategory(null)).toBe("No data")
  })

  it("uses US AQI names for model values", () => {
    expect(usAqiCategory(120)).toBe("Unhealthy for sensitive groups")
    expect(usAqiCategory(null)).toBe("No data")
  })

  it("uses the MOE thresholds (>100, >200) for Orange and Red", () => {
    expect(levelFromIndex(100)).toBe("Green")
    expect(levelFromIndex(101)).toBe("Orange")
    expect(levelFromIndex(200)).toBe("Orange")
    expect(levelFromIndex(201)).toBe("Red")
    expect(levelFromIndex(null)).toBe("Green")
    expect(maxLevel("Orange", "Green")).toBe("Orange")
    expect(maxLevel("Red", "Orange")).toBe("Red")
  })

  it("never lets Orange or Red auto-send (D-08)", () => {
    expect(autonomyFor("Green")).toBe("auto-send")
    expect(autonomyFor("Orange")).toBe("needs-approval")
    expect(autonomyFor("Red")).toBe("needs-approval")
  })

  it("states school closure only above 200", () => {
    expect(policyFor(150).statements.some((s) => /close/i.test(s.text))).toBe(false)
    expect(policyFor(250).statements.some((s) => /close/i.test(s.text))).toBe(true)
    expect(policyFor(50).statements).toHaveLength(0)
  })
})

describe("bias adjustment", () => {
  const model = [50, 60, 70, 80, 90, 100]
  it("shifts the forecast by the current gap and tapers to zero", () => {
    const { adjusted, bias } = biasAdjust(model, 1, 100, 4) // modelNow=60 -> bias +40, taper over 4h
    expect(bias).toBe(40)
    expect(adjusted[0]).toBeNull()
    expect(adjusted[1]).toBe(100) // 60 + 40*1
    expect(adjusted[2]).toBe(100) // 70 + 40*0.75
    expect(adjusted[5]).toBe(100) // 100 + 40*0 (fully tapered)
  })
  it("returns the raw model when DOE is missing", () => {
    const { adjusted, bias } = biasAdjust(model, 1, null)
    expect(bias).toBeNull()
    expect(adjusted).toEqual([null, 60, 70, 80, 90, 100])
  })
  it("never goes below zero", () => {
    const { adjusted } = biasAdjust([100, 100, 100], 0, 0, 48)
    expect(adjusted.every((v) => v == null || v >= 0)).toBe(true)
  })
})

describe("series helpers", () => {
  it("finds crossings", () => {
    const s = [10, 50, 120, 130, 90, 80]
    expect(firstAbove(s, 100)).toBe(2)
    expect(firstAbove(s, 200)).toBe(-1)
    expect(firstBackBelow(s, 100, 2)).toBe(4)
    expect(firstAbove([null, 120], 100)).toBe(1)
  })
  it("converts instants to KL local hours (UTC+8, no DST)", () => {
    expect(klHourString(new Date("2026-10-22T05:30:00Z"))).toBe("2026-10-22T13:00")
    expect(klHourString(new Date("2026-10-22T17:00:00Z"))).toBe("2026-10-23T01:00")
  })
  it("locates the current hour in a series", () => {
    const times = ["2026-10-22T11:00", "2026-10-22T12:00", "2026-10-22T13:00", "2026-10-22T14:00"]
    expect(nowIndexIn(times, new Date("2026-10-22T05:30:00Z"))).toBe(2)
    expect(nowIndexIn(times, new Date("2026-10-20T00:00:00Z"))).toBe(0)
  })
  it("formats labels", () => {
    expect(hourLabel("2026-10-22T00:00")).toBe("12 AM")
    expect(hourLabel("2026-10-22T15:00")).toBe("3 PM")
    expect(dayLabel("2026-10-22T12:00")).toContain("22")
  })
  it("labels times relative to now, in English and Malay", () => {
    const now = "2026-10-22T21:00"
    expect(whenLabel("2026-10-22T23:00", now)).toBe("11 PM today")
    expect(whenLabel("2026-10-23T20:00", now)).toBe("8 PM tomorrow")
    expect(whenLabel("2026-10-23T20:00", now, "bm")).toBe("8 PM esok")
    expect(whenLabel("2026-10-22T23:00", now, "bm")).toBe("11 PM hari ini")
    expect(whenLabel("2026-10-25T03:00", now)).toMatch(/^3 AM on .*25/)
  })
  it("finds the nearest station by distance", () => {
    const a = station({ id: "a", name: "A", lat: 3.2, lon: 101.68 })
    const b = station({ id: "b", name: "B", lat: 3.1, lon: 101.72 })
    const n = nearestStation(3.11, 101.71, [a, b])
    expect(n?.station.id).toBe("b")
    expect(n!.distanceKm).toBeLessThan(3)
    expect(nearestStation(3, 101, [])).toBeNull()
  })
})

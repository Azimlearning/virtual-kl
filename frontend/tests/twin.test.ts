import { describe, expect, it } from "vitest"
import { compare, generatePopulation, makeWindow, positionsAt, simulate, stateAt, stateSeries, summarize } from "@/lib/twin/engine"
import { PERSONAS, PRESET_INTERVENTIONS } from "@/lib/twin/personas"
import { hash01, mulberry32 } from "@/lib/twin/prng"
import type { Intervention } from "@/lib/twin/types"
import { FOCUS_AREAS, focusById } from "@/lib/kl/geo"
import { haversineKm } from "@/lib/kl/scoring"
import { makeSnapshot, makeTimes } from "./fixtures"

const focus = focusById("kl-east")

/** 48 h window starting 2026-10-22T06:00 with a haze event from h+24 to h+36 at AQI 160. */
function eventWindow() {
  const s = makeSnapshot({ base: 60, peak: 160, eventFrom: 252 + 18, eventTo: 252 + 30, nowIndex: 252 })
  return makeWindow(s.series.map((p) => p.t), s.adjusted, "forecast", s.nowIndex)
}

describe("prng", () => {
  it("is deterministic per seed", () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(hash01(5, 9, 1)).toBe(hash01(5, 9, 1))
    expect(hash01(5, 9, 1)).not.toBe(hash01(5, 10, 1))
    const v = hash01(3, 4, 5)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })
})

describe("personas", () => {
  it("shares sum to 1 and every persona has 24 outdoor values in [0,1]", () => {
    expect(PERSONAS.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1, 10)
    for (const p of PERSONAS) {
      expect(p.outdoor).toHaveLength(24)
      expect(p.outdoor.every((v) => v >= 0 && v <= 1)).toBe(true)
      expect(Object.values(p.channels).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    }
  })
})

describe("population", () => {
  it("is deterministic, the right size, inside the focus radius, with roughly the persona shares", () => {
    const a = generatePopulation(focus, 3000, 42)
    const b = generatePopulation(focus, 3000, 42)
    expect(a).toEqual(b)
    expect(a).toHaveLength(3000)
    for (const r of a.slice(0, 300)) expect(haversineKm(focus.lat, focus.lon, r.lat, r.lon) * 1000).toBeLessThanOrEqual(focus.radiusM * 1.02)
    for (const p of PERSONAS) {
      const share = a.filter((r) => r.persona === p.id).length / a.length
      expect(Math.abs(share - p.share)).toBeLessThan(0.03)
    }
    expect(a.every((r) => r.trust >= 0.05 && r.trust <= 1)).toBe(true)
  })
  it("differs for a different seed", () => {
    expect(generatePopulation(focus, 50, 1)).not.toEqual(generatePopulation(focus, 50, 2))
  })
  it("has valid focus areas with sourced coordinates", () => {
    for (const f of FOCUS_AREAS) {
      expect(f.source.length).toBeGreaterThan(5)
      expect(f.lat).toBeGreaterThan(2.9)
      expect(f.lat).toBeLessThan(3.4)
      expect(f.lon).toBeGreaterThan(101.5)
      expect(f.lon).toBeLessThan(101.9)
    }
  })
})

describe("makeWindow", () => {
  it("forecast mode starts at now and finds the event start", () => {
    const w = eventWindow()
    expect(w.values).toHaveLength(48)
    expect(w.kind).toBe("forecast")
    expect(w.eventStart).toBe(18)
    expect(w.startsAbove).toBe(false)
  })
  it("replay starts 24 h before a real onset (a crossing after calm) so lead times matter", () => {
    // calm at 60, then haze from index 100 (above 100 for 30 h, peaking at 220)
    const s = makeSnapshot({ base: 60, peak: 220, eventFrom: 100, eventTo: 130, nowIndex: 252 })
    const w = makeWindow(s.series.map((p) => p.t), s.series.map((p) => p.usAqi), "replay", s.nowIndex)
    expect(w.kind).toBe("replay")
    expect(w.eventStart).toBe(24)
    expect(w.startsAbove).toBe(false)
    expect(Math.max(...w.values)).toBe(220)
    expect(w.label).toMatch(/real haze onset/)
  })
  it("replay picks the onset with the worst peak when there are several", () => {
    const times = makeTimes(400)
    const values = times.map((_, i) => (i >= 60 && i <= 70 ? 130 : i >= 200 && i <= 230 ? 260 : 50))
    const w = makeWindow(times, values, "replay", 399)
    expect(Math.max(...w.values)).toBe(260)
    expect(w.eventStart).toBe(24)
  })
  it("replay falls back to the highest value when the history has no clean onset", () => {
    const times = makeTimes(200)
    const values = times.map((_, i) => 150 + (i === 120 ? 100 : 0)) // above 100 from the very start
    const w = makeWindow(times, values, "replay", 199)
    expect(Math.max(...w.values)).toBe(250)
    expect(w.label).toMatch(/no clean onset/)
  })
  it("reports no event when nothing exceeds 100", () => {
    const s = makeSnapshot({ base: 60, peak: 90 })
    const w = makeWindow(s.series.map((p) => p.t), s.adjusted, "forecast", s.nowIndex)
    expect(w.eventStart).toBe(-1)
  })
})

describe("simulate", () => {
  const pop = generatePopulation(focus, 2000, 99)
  const win = eventWindow()
  const baseline = PRESET_INTERVENTIONS[0]
  const complete6 = PRESET_INTERVENTIONS.find((i) => i.id === "complete-6h")!
  const generic1 = PRESET_INTERVENTIONS.find((i) => i.id === "generic-1h")!
  const complete1 = PRESET_INTERVENTIONS.find((i) => i.id === "complete-1h")!

  it("is deterministic for the same seed", () => {
    const a = simulate(pop, win, complete6, 5)
    const b = simulate(pop, win, complete6, 5)
    expect(Array.from(a.exposure)).toEqual(Array.from(b.exposure))
    expect(Array.from(a.actHour)).toEqual(Array.from(b.actHour))
  })

  it("a complete 6 h warning leaves residents less exposed than no proactive warning", () => {
    const [base, w] = compare(pop, win, [baseline, complete6], 5)
    expect(w.summary.meanExposureHours).toBeLessThan(base.summary.meanExposureHours)
    expect(w.summary.actedBeforeEventPct).toBeGreaterThan(base.summary.actedBeforeEventPct)
    expect(w.summary.informedPct).toBeGreaterThan(base.summary.informedPct)
  })

  it("a complete message beats a generic one at the same lead", () => {
    const [g, c] = compare(pop, win, [generic1, complete1], 5)
    expect(c.summary.meanExposureHours).toBeLessThan(g.summary.meanExposureHours)
  })

  it("earlier warnings are never worse than later ones (same message)", () => {
    const iv = (lead: number): Intervention => ({ id: `c${lead}`, label: "c", leadHours: lead, message: "complete" })
    const [l1, l6] = compare(pop, win, [iv(1), iv(6)], 5)
    expect(l6.summary.actedBeforeEventPct).toBeGreaterThanOrEqual(l1.summary.actedBeforeEventPct)
    expect(l6.summary.meanExposureHours).toBeLessThanOrEqual(l1.summary.meanExposureHours + 1e-9)
  })

  it("does nothing when there is no event", () => {
    const calm = makeSnapshot({ base: 50, peak: 80 })
    const w = makeWindow(calm.series.map((p) => p.t), calm.adjusted, "forecast", calm.nowIndex)
    const out = simulate(pop, w, complete6, 5)
    expect(Array.from(out.exposure).every((e) => e === 0)).toBe(true)
    expect(out.sendHour).toBeNull()
    expect(summarize(pop, w, out).informedPct).toBe(0)
  })

  it("collapses lead times when the window starts above the threshold", () => {
    const s = makeSnapshot({ base: 160, peak: 160, nowIndex: 252 })
    const w = makeWindow(s.series.map((p) => p.t), s.adjusted, "forecast", s.nowIndex)
    expect(w.startsAbove).toBe(true)
    const a = simulate(pop, w, { id: "a", label: "a", leadHours: 1, message: "complete" }, 5)
    const b = simulate(pop, w, { id: "b", label: "b", leadHours: 12, message: "complete" }, 5)
    expect(a.sendHour).toBe(0)
    expect(b.sendHour).toBe(0)
  })

  it("summary numbers are consistent", () => {
    const out = simulate(pop, win, complete6, 5)
    const sum = summarize(pop, win, out)
    expect(sum.residents).toBe(pop.length)
    expect(sum.actedBeforeEventPct).toBeLessThanOrEqual(sum.actedPct)
    expect(sum.actedPct).toBeLessThanOrEqual(sum.informedPct)
    expect(sum.byPersona.reduce((a, p) => a + p.n, 0)).toBe(pop.length)
  })

  it("residents who act are 'protected' from their action hour onward", () => {
    const out = simulate(pop, win, complete6, 5)
    const i = Array.from(out.actHour).findIndex((h) => h >= 0)
    expect(i).toBeGreaterThanOrEqual(0)
    expect(stateAt(pop[i], out, win, out.actHour[i], 5)).toBe("protected")
    expect(stateAt(pop[i], out, win, win.values.length - 1, 5)).toBe("protected")
  })

  it("state series covers every hour and counts every resident", () => {
    const out = simulate(pop, win, complete6, 5)
    const s = stateSeries(pop, out, win, 5)
    expect(s).toHaveLength(win.values.length)
    for (const c of s) expect(c.unaware + c.informed + c.protected + c.exposed).toBe(pop.length)
  })
})

describe("positionsAt (map animation)", () => {
  const pop = generatePopulation(focus, 500, 11)
  const win = eventWindow()
  const hourWithIndex = (hod: number) => win.times.findIndex((t) => Number(t.slice(11, 13)) === hod)

  it("returns one lon/lat pair per resident, deterministic", () => {
    const a = positionsAt(pop, win, 5)
    expect(a).toHaveLength(pop.length * 2)
    expect(Array.from(positionsAt(pop, win, 5))).toEqual(Array.from(a))
  })

  it("keeps residents at home in the dead of night and moves commuters toward their destination at rush hour", () => {
    const night = positionsAt(pop, win, hourWithIndex(3))
    const rush = positionsAt(pop, win, hourWithIndex(8))
    const commuter = pop.find((r) => r.persona === "commuter")!
    const i = commuter.id
    const dNight = Math.hypot(night[i * 2] - commuter.lon, night[i * 2 + 1] - commuter.lat)
    const dRush = Math.hypot(rush[i * 2] - commuter.lon, rush[i * 2 + 1] - commuter.lat)
    expect(dNight).toBeLessThan(dRush)
    expect(dRush).toBeGreaterThan(0)
  })

  it("never moves anyone further than their destination", () => {
    const rush = positionsAt(pop, win, hourWithIndex(8))
    for (const r of pop.slice(0, 100)) {
      const dTotal = Math.hypot(r.destLon - r.lon, r.destLat - r.lat)
      const dNow = Math.hypot(rush[r.id * 2] - r.lon, rush[r.id * 2 + 1] - r.lat)
      expect(dNow).toBeLessThanOrEqual(dTotal + 1e-12)
    }
  })
})

describe("site-manager action (D-27)", () => {
  const pop = generatePopulation(focus, 3000, 99)
  const win = eventWindow()
  const get = (id: string) => PRESET_INTERVENTIONS.find((i) => i.id === id)!
  const [base, site, both, warn] = compare(pop, win, [get("baseline"), get("site-only"), get("complete-6h-site"), get("complete-6h")], 5)
  const worker = (r: typeof base) => r.summary.byPersona.find((p) => p.persona === "outdoor-worker")!

  it("cuts outdoor workers' exposure a lot more than a resident warning alone does", () => {
    expect(worker(site).meanExposureHours).toBeLessThan(worker(warn).meanExposureHours)
    expect(worker(site).meanExposureHours).toBeLessThan(worker(base).meanExposureHours)
    expect(worker(both).meanExposureHours).toBeLessThanOrEqual(worker(site).meanExposureHours + 1e-9)
  })

  it("leaves everyone else untouched when used alone", () => {
    for (const p of PERSONAS.filter((x) => x.id !== "outdoor-worker")) {
      const a = base.summary.byPersona.find((x) => x.persona === p.id)!
      const b = site.summary.byPersona.find((x) => x.persona === p.id)!
      expect(b.meanExposureHours).toBeCloseTo(a.meanExposureHours, 9)
    }
  })

  it("only ever manages outdoor workers, and only a share of them", () => {
    const workerShare = pop.filter((r) => r.persona === "outdoor-worker").length / pop.length
    expect(site.summary.siteManagedPct / 100).toBeGreaterThan(0)
    expect(site.summary.siteManagedPct / 100).toBeLessThan(workerShare)
    pop.forEach((r, i) => { if (site.outcome.siteHour[i] >= 0) expect(r.persona).toBe("outdoor-worker") })
    expect(base.summary.siteManagedPct).toBe(0)
  })

  it("does nothing when no hour exceeds 100", () => {
    const s = makeSnapshot({ base: 60, peak: 90 })
    const calm = makeWindow(s.series.map((p) => p.t), s.adjusted, "forecast", s.nowIndex)
    expect(simulate(pop, calm, get("site-only"), 5).siteHour.every((h) => h === -1)).toBe(true)
  })

  it("shows managed workers as protected on the map once the manager acts", () => {
    const i = site.outcome.siteHour.findIndex((h) => h >= 0)
    const h = site.outcome.siteHour[i]
    expect(stateAt(pop[i], site.outcome, win, h, 5)).toBe("protected")
  })
})

import { describe, expect, it } from "vitest"
import { draftInitiative, observe, recommend, type Memory } from "@/lib/kl/proactive"
import type { Advisory } from "@/lib/kl/types"
import { makeSnapshot } from "./fixtures"

const NOW = new Date("2026-10-22T04:30:00Z")
const kinds = (o: ReturnType<typeof observe>) => o.initiatives.map((i) => i.kind)

describe("recommend", () => {
  it("rehearses every option and picks one that beats doing nothing, including the site-manager lever", () => {
    const snap = makeSnapshot({ doe: 60, base: 60, peak: 170, eventFrom: 252 + 18, eventTo: 252 + 32 })
    const rec = recommend(snap, "kl-east", 800)!
    expect(rec.options.length).toBeGreaterThanOrEqual(7)
    expect(rec.bestExposure).toBeLessThan(rec.baselineExposure)
    expect(rec.reductionPct).toBeGreaterThan(0)
    expect(rec.bestId).toMatch(/site/)
    expect(rec.workerBest).toBeLessThan(rec.workerBaseline)
  })
  it("has nothing to rehearse when no hour exceeds 100", () => {
    expect(recommend(makeSnapshot({ base: 60, peak: 90 }))).toBeNull()
  })
})

describe("observe: the agent notices things without being asked", () => {
  const orange = () => makeSnapshot({ doe: 155, base: 150, peak: 165, eventFrom: 256, eventTo: 270 })
  const green = () => makeSnapshot({ doe: 60, base: 60, peak: 90 })

  it("introduces itself on first look and asks for a draft when it is already Orange", () => {
    const o = observe(null, orange(), NOW)
    expect(o.level).toBe("Orange")
    expect(kinds(o)).toEqual(expect.arrayContaining(["watch", "rehearsal"]))
    expect(o.wantsDraft).toBe(true)
    const r = o.initiatives.find((i) => i.kind === "rehearsal")!
    expect(r.needsYou).toBe("decision")
    expect(r.actions?.some((a) => a.type === "apply")).toBe(true)
  })

  it("stays quiet when nothing changed (no spam on every tick)", () => {
    const first = observe(null, orange(), NOW)
    const again = observe(first.memory, orange(), new Date(NOW.getTime() + 60_000))
    expect(again.initiatives).toHaveLength(0)
    expect(again.wantsDraft).toBe(false)
  })

  it("is calm and quiet when all clear", () => {
    const o = observe(null, green(), NOW)
    expect(kinds(o)).toEqual(["watch"])
    expect(o.wantsDraft).toBe(false)
  })

  it("raises an alert, rehearses and asks for a draft when the level rises", () => {
    const calm = observe(null, green(), NOW)
    const o = observe(calm.memory, orange(), new Date(NOW.getTime() + 60_000))
    expect(kinds(o)).toEqual(expect.arrayContaining(["alert", "rehearsal"]))
    expect(o.wantsDraft).toBe(true)
  })

  it("says it is easing when the level falls", () => {
    const hot = observe(null, orange(), NOW)
    const o = observe(hot.memory, green(), new Date(NOW.getTime() + 60_000))
    expect(kinds(o)).toContain("recovery")
    expect(o.wantsDraft).toBe(false)
  })

  it("warns about an upcoming crossing once, early, and rehearses for it", () => {
    const upcoming = () => makeSnapshot({ doe: 70, base: 60, peak: 150, eventFrom: 252 + 8, eventTo: 252 + 20 })
    const first = observe(null, upcoming(), NOW)
    const a = first.initiatives.find((i) => i.kind === "anticipate")!
    expect(a.title).toMatch(/cross 100 in about 8 h/)
    expect(first.initiatives.some((i) => i.kind === "rehearsal")).toBe(true)
    const again = observe(first.memory, upcoming(), new Date(NOW.getTime() + 60_000))
    expect(again.initiatives.some((i) => i.kind === "anticipate")).toBe(false)
  })

  it("reports a sudden jump in the reading", () => {
    const base = observe(null, makeSnapshot({ doe: 60, base: 60, peak: 90 }), NOW)
    const o = observe(base.memory, makeSnapshot({ doe: 90, base: 60, peak: 90 }), new Date(NOW.getTime() + 60_000))
    expect(o.initiatives.find((i) => i.title.startsWith("Reading jumped by 30"))).toBeTruthy()
  })

  it("never claims things are fine when every feed is down, and says when they return", () => {
    const blank = { ...makeSnapshot(), stations: [], series: [], adjusted: [], nowIndex: 0 }
    const down = observe(null, blank, NOW)
    expect(kinds(down)).toEqual(["data"])
    expect(down.initiatives[0].tone).toBe("severe")
    expect(down.wantsDraft).toBe(false)
    const still = observe(down.memory, blank, new Date(NOW.getTime() + 60_000))
    expect(still.initiatives).toHaveLength(0)
    const back = observe(down.memory, makeSnapshot({ doe: 60, base: 60, peak: 90 }), new Date(NOW.getTime() + 120_000))
    expect(back.initiatives[0].title).toMatch(/feeds are back/i)
  })

  it("does not draft twice for the same level on the same day", () => {
    const m: Memory = observe(null, orange(), NOW).memory
    expect(observe(m, orange(), new Date(NOW.getTime() + 600_000)).wantsDraft).toBe(false)
  })
})

describe("draftInitiative", () => {
  const adv = (status: Advisory["status"]) => ({ status }) as Advisory
  it("asks for approval while advisories are pending, and nothing when none are", () => {
    const pending = draftInitiative(NOW, "Orange", [adv("pending-approval"), adv("pending-approval")], true)
    expect(pending.needsYou).toBe("approval")
    expect(pending.actions?.some((a) => a.type === "approve")).toBe(true)
    expect(pending.title).toMatch(/2 advisories/)
    const done = draftInitiative(NOW, "Orange", [adv("auto-sent")], false)
    expect(done.needsYou).toBeUndefined()
    expect(done.body).toMatch(/Templates/)
  })
})

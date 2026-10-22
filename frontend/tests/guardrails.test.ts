import { describe, expect, it } from "vitest"
import { checkAdvisory, extractNumbers, type Facts } from "@/lib/kl/guardrails"
import type { MessageParts } from "@/lib/kl/types"
import { templateMessage } from "@/lib/kl/templates"

const facts: Facts = { numbers: [95, 100, 200, 48, 155, 162], maxLevel: "Orange", apiNow: 155, forecastPeak: 162 }

const good: { en: MessageParts; bm: MessageParts } = {
  en: {
    headline: "Unhealthy haze in Kuala Lumpur",
    what: "Air quality is Unhealthy (API 155) at Batu Muda.",
    where: "Kuala Lumpur",
    when: "Likely above 100 until about 3 PM tomorrow.",
    action: "Wear an N95 mask outdoors and keep windows closed.",
  },
  bm: {
    headline: "Jerebu tidak sihat di Kuala Lumpur",
    what: "Kualiti udara Tidak sihat (API 155) di Batu Muda.",
    where: "Kuala Lumpur",
    when: "Dijangka melebihi 100 sehingga kira-kira jam 3 petang esok.",
    action: "Pakai pelitup N95 di luar dan tutup tingkap.",
  },
}

describe("extractNumbers", () => {
  it("ignores times, durations and dates but keeps measurements", () => {
    expect(extractNumbers("API 155 until 3 PM, 14:00, in 48 hours on 22 Oct")).toEqual([155])
    expect(extractNumbers("jam 3 petang, 6 jam")).toEqual([])
    expect(extractNumbers("peaks at 162.5")).toEqual([162.5])
  })
})

describe("checkAdvisory", () => {
  it("passes a grounded, complete, honest advisory", () => {
    const r = checkAdvisory(good.en, good.bm, facts)
    expect(r.passed).toBe(true)
    expect(r.unknownNumbers).toEqual([])
  })

  it("fails when a number is not in the facts", () => {
    const bad = { ...good.en, what: "Air quality is Unhealthy (API 230) at Batu Muda." }
    const r = checkAdvisory(bad, good.bm, facts)
    expect(r.numbersGrounded).toBe(false)
    expect(r.unknownNumbers).toContain(230)
    expect(r.passed).toBe(false)
  })

  it("fails an overstated alert level", () => {
    const bad = { ...good.en, headline: "Red alert for Kuala Lumpur" }
    const r = checkAdvisory(bad, good.bm, facts)
    expect(r.levelOk).toBe(false)
    expect(r.passed).toBe(false)
    expect(checkAdvisory(bad, good.bm, { ...facts, maxLevel: "Red" }).levelOk).toBe(true)
  })

  it("fails a school-closure claim unless API is above 200", () => {
    const bad = { ...good.en, action: "Schools will be closed tomorrow." }
    const r = checkAdvisory(bad, good.bm, facts)
    expect(r.claimsOk).toBe(false)
    expect(r.claimIssues.join(" ")).toMatch(/school/i)
    expect(checkAdvisory(bad, good.bm, { ...facts, forecastPeak: 230, numbers: [...facts.numbers, 230] }).claimsOk).toBe(true)
  })

  it("fails evacuation and official-order claims", () => {
    expect(checkAdvisory({ ...good.en, action: "Evacuate to a shelter." }, good.bm, facts).claimsOk).toBe(false)
    expect(checkAdvisory({ ...good.en, action: "The government has ordered everyone indoors." }, good.bm, facts).claimsOk).toBe(false)
  })

  it("fails an incomplete message and names what is missing", () => {
    const r = checkAdvisory({ ...good.en, when: "" }, good.bm, facts)
    expect(r.complete).toBe(false)
    expect(r.missing).toContain("EN when")
    expect(r.passed).toBe(false)
  })
})

describe("templates", () => {
  it("every template passes the guardrails with the facts the agent supplies", () => {
    for (const group of ["parents-schools", "elderly-respiratory", "outdoor-workers", "general"] as const) {
      const msg = templateMessage(group, {
        level: "Orange",
        apiNow: 155,
        stationName: "Batu Muda",
        category: "Unhealthy",
        forecastPeak: 162,
        peakTime: "8 PM",
        clearTime: "3 PM",
      })
      const r = checkAdvisory(msg.en, msg.bm, facts)
      expect(r.passed, `${group}: ${JSON.stringify(r)}`).toBe(true)
    }
  })
})

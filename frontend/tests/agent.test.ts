import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runAgent } from "@/lib/kl/agent"
import { corroborate } from "@/lib/kl/check"
import { LlmNotConfigured, extractJson, generateJson, generateText, llmConfigured, setLlmClientForTests, type LlmClient } from "@/lib/kl/llm"
import type { PhotoObservation } from "@/lib/kl/types"
import { z } from "zod"
import { makeSnapshot, station } from "./fixtures"

const NOW = new Date("2026-10-22T04:30:00Z") // 12:30 KL = index 252
const SAVED_KEY = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  setLlmClientForTests(null)
})
afterEach(() => {
  if (SAVED_KEY) process.env.ANTHROPIC_API_KEY = SAVED_KEY
  setLlmClientForTests(null)
})

function fakeClient(reply: unknown | (() => unknown)): LlmClient & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    messages: {
      create: async (args: unknown) => {
        calls.push(args)
        const r = typeof reply === "function" ? (reply as () => unknown)() : reply
        return { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }] }
      },
    },
  }
}

const msg = (what: string) => ({ headline: "Haze alert", what, where: "Kuala Lumpur", when: "Until about 3 PM", action: "Wear an N95 mask outdoors" })
const audiences = ["parents-schools", "elderly-respiratory", "outdoor-workers", "general"] as const

describe("runAgent — no model key (templates)", () => {
  it("runs all five steps and drafts four guarded advisories that wait for approval at Orange", async () => {
    const snap = makeSnapshot({ doe: 155, base: 150, peak: 165, eventFrom: 256, eventTo: 270 })
    const run = await runAgent(snap, { now: NOW, population: 400 })
    expect(run.steps.map((s) => s.id)).toEqual(["watch", "anticipate", "simulate", "decide", "act"])
    expect(run.decision.level).toBe("Orange")
    expect(run.decision.autonomy).toBe("needs-approval")
    expect(run.llm).toBe("template")
    expect(run.llmNote).toMatch(/ANTHROPIC_API_KEY/)
    expect(run.advisories).toHaveLength(4)
    for (const a of run.advisories) {
      expect(a.status).toBe("pending-approval")
      expect(a.source).toBe("template")
      expect(a.guardrails.passed).toBe(true)
    }
    expect(run.simulation.simulated).toBe(true)
    expect(run.simulation.calibration).toBe("illustrative")
  })

  it("never auto-sends at Red", async () => {
    const snap = makeSnapshot({ doe: 250, base: 240, peak: 260, eventFrom: 256, eventTo: 270 })
    const run = await runAgent(snap, { now: NOW, population: 300 })
    expect(run.decision.level).toBe("Red")
    expect(run.advisories.every((a) => a.status === "pending-approval")).toBe(true)
  })

  it("decides to do nothing when everything is at or below 100", async () => {
    const snap = makeSnapshot({ doe: 60, base: 60, peak: 90 })
    const run = await runAgent(snap, { now: NOW, population: 300 })
    expect(run.decision.level).toBe("Green")
    expect(run.advisories).toHaveLength(0)
    expect(run.steps[4].summary).toMatch(/nothing/i)
  })

  it("still works with no DOE stations (falls back to the model forecast)", async () => {
    const snap = makeSnapshot({ doe: null, base: 60, peak: 160 })
    const run = await runAgent(snap, { now: NOW, population: 300 })
    expect(run.steps[0].details.join(" ")).toMatch(/DOE readings unavailable/)
    expect(["Green", "Orange", "Red"]).toContain(run.decision.level)
  })
})

describe("runAgent — with a (fake) model", () => {
  const snap = () => makeSnapshot({ doe: 155, base: 150, peak: 165, eventFrom: 256, eventTo: 270 })

  it("uses model advisories that pass the guardrails", async () => {
    const client = fakeClient({ advisories: audiences.map((a) => ({ audience: a, en: msg("Air quality is Unhealthy (API 155)"), bm: { ...msg("Kualiti udara Tidak sihat (API 155)"), headline: "Amaran jerebu" } })) })
    setLlmClientForTests(client)
    const run = await runAgent(snap(), { now: NOW, population: 300 })
    expect(run.llm).toBe("claude")
    expect(run.advisories.every((a) => a.source === "claude" && a.guardrails.passed)).toBe(true)
    expect(client.calls).toHaveLength(1)
    // regression: a live run truncated the JSON at the default 1800-token limit
    expect((client.calls[0] as { max_tokens: number }).max_tokens).toBeGreaterThanOrEqual(3000)
  })

  it("accepts a bare list of advisories as well as the wrapped object (seen in a live run)", async () => {
    setLlmClientForTests(fakeClient(audiences.map((a) => ({ audience: a, en: msg("Air quality is Unhealthy (API 155)"), bm: msg("Kualiti udara Tidak sihat (API 155)") }))))
    const run = await runAgent(snap(), { now: NOW, population: 300 })
    expect(run.llm).toBe("claude")
    expect(run.advisories.every((a) => a.source === "claude")).toBe(true)
  })

  it("replaces an advisory that invents a number, and says so", async () => {
    const list = audiences.map((a) => ({
      audience: a,
      en: msg(a === "general" ? "Air quality is Unhealthy (API 999)" : "Air quality is Unhealthy (API 155)"),
      bm: msg("Kualiti udara Tidak sihat (API 155)"),
    }))
    setLlmClientForTests(fakeClient({ advisories: list }))
    const run = await runAgent(snap(), { now: NOW, population: 300 })
    const general = run.advisories.find((a) => a.audience === "general")!
    expect(general.source).toBe("template")
    expect(general.guardrails.passed).toBe(true)
    expect(run.advisories.filter((a) => a.source === "claude")).toHaveLength(3)
    expect(run.llmNote).toMatch(/failed the guardrails/)
  })

  it("falls back to templates when the model call fails", async () => {
    setLlmClientForTests({ messages: { create: async () => { throw new Error("boom") } } })
    const run = await runAgent(snap(), { now: NOW, population: 300 })
    expect(run.llm).toBe("template")
    expect(run.llmNote).toMatch(/Model call failed/)
    expect(run.advisories).toHaveLength(4)
  })
})

describe("llm wrapper", () => {
  it("extracts JSON from fenced, chatty replies", () => {
    expect(extractJson('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Here: [1,2,3] done')).toEqual([1, 2, 3])
    expect(() => extractJson("no json here")).toThrow()
  })
  it("is not configured without a key and says which variable to set", async () => {
    expect(llmConfigured()).toBe(false)
    await expect(generateText({ system: "s", user: "u" })).rejects.toBeInstanceOf(LlmNotConfigured)
    await expect(generateText({ system: "s", user: "u" })).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })
  it("sends the configured model and prompt, and retries once on bad JSON", async () => {
    process.env.ANTHROPIC_MODEL = "claude-test-model"
    let n = 0
    const client = fakeClient(() => (++n === 1 ? "not json" : '{"ok": true}'))
    setLlmClientForTests(client)
    const out = await generateJson({ system: "sys", user: "usr", schema: z.object({ ok: z.boolean() }) })
    expect(out).toEqual({ ok: true })
    expect(client.calls).toHaveLength(2)
    const first = client.calls[0] as { model: string; system: string; messages: { content: string }[] }
    expect(first.model).toBe("claude-test-model")
    expect(first.system).toContain("sys")
    expect(first.messages[0].content).toBe("usr")
    delete process.env.ANTHROPIC_MODEL
  })
})

describe("photo corroboration", () => {
  const obs = (over: Partial<PhotoObservation>): PhotoObservation => ({ hazard: "haze", visibility: "poor", observations: [], confidence: 0.8, ...over })
  const snap = (api: number | null) => ({ ...makeSnapshot(), stations: [station({ api, category: "x" })] })
  const lat = 3.2124
  const lon = 101.6822

  it("corroborates poor visibility when the nearest DOE reading is unhealthy", () => {
    const c = corroborate(obs({}), snap(155), lat, lon)
    expect(c.verdict).toBe("corroborated")
    expect(c.nearestStation?.name).toBe("Batu Muda")
  })
  it("contradicts poor visibility when the reading says Good", () => {
    expect(corroborate(obs({}), snap(40), lat, lon).verdict).toBe("contradicted")
  })
  it("contradicts good visibility under a very high reading", () => {
    expect(corroborate(obs({ visibility: "good" }), snap(180), lat, lon).verdict).toBe("contradicted")
  })
  it("is unverified when readings and photo are ambiguous or there is no reading", () => {
    expect(corroborate(obs({ visibility: "moderate" }), snap(80), lat, lon).verdict).toBe("unverified")
    expect(corroborate(obs({}), snap(null), lat, lon).verdict).toBe("unverified")
  })
  it("never verifies a flood photo against the frozen JPS feed", () => {
    const c = corroborate(obs({ hazard: "flood" }), snap(155), lat, lon)
    expect(c.verdict).toBe("unverified")
    expect(c.reasons.join(" ")).toMatch(/frozen/)
  })
  it("sends fire to 999 and treats 'none' as unverified", () => {
    expect(corroborate(obs({ hazard: "fire" }), snap(155), lat, lon).reasons.join(" ")).toMatch(/999/)
    expect(corroborate(obs({ hazard: "none" }), snap(155), lat, lon).verdict).toBe("unverified")
  })
})

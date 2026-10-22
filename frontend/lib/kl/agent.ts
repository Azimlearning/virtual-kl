import { z } from "zod"
import type {
  Advisory,
  AgentRun,
  AgentStep,
  FocusArea,
  Level,
  PersonaGroup,
  ScenarioSummary,
  Snapshot,
} from "./types"
import { FOCUS_AREAS, focusById } from "./geo"
import { LlmNotConfigured, generateJson, llmConfigured } from "./llm"
import { checkAdvisory, type Facts } from "./guardrails"
import { autonomyFor, policyFor } from "./policy"
import { doeCategory, firstAbove, firstBackBelow, levelFromIndex, maxLevel, usAqiCategory, whenLabel } from "./scoring"
import { metEn } from "./met"
import { maxApiNow } from "./snapshot"
import { AUDIENCES, templateMessage, type AdvisoryContext } from "./templates"
import { compare, generatePopulation, makeWindow, summarize } from "@/lib/twin/engine"
import { PRESET_INTERVENTIONS } from "@/lib/twin/personas"

/** Numbers that may always appear: DOE thresholds and the N95 mask rating. */
const ALWAYS_ALLOWED = [95, 100, 200, 48]

const MessageSchema = z.object({
  headline: z.string(),
  what: z.string(),
  where: z.string(),
  when: z.string(),
  action: z.string(),
})
const AdvisorySchema = z.object({
  audience: z.enum(["parents-schools", "elderly-respiratory", "outdoor-workers", "general"]),
  en: MessageSchema,
  bm: MessageSchema,
})
// The model sometimes returns the bare list instead of {"advisories": [...]}; accept both.
const ModelOutputSchema = z.union([
  z.object({ advisories: z.array(AdvisorySchema) }),
  z.array(AdvisorySchema).transform((advisories) => ({ advisories })),
])

const SYSTEM = `You write short public-safety advisories for residents of Kuala Lumpur during a haze event.
Hard rules:
- Use ONLY the numbers given in the facts. Never invent a number, a time, a place or a statistic.
- Do not tell anyone to evacuate. Do not claim any official order, closure or announcement unless the facts say so.
- Do not state an alert level (Red/Orange) higher than the "level" in the facts.
- Every advisory must be complete: headline, what (what is happening), where, when (how long / peak), action (what to do now).
- Each field is one short sentence (under 25 words). Plain language. Write natural Bahasa Malaysia for "bm".
- Tailor the action to the audience.
Output shape (exactly): {"advisories":[{"audience":"parents-schools"|"elderly-respiratory"|"outdoor-workers"|"general","en":{"headline":"","what":"","where":"","when":"","action":""},"bm":{"headline":"","what":"","where":"","when":"","action":""}}]} with one entry per audience given.`

export type AgentOptions = { now?: Date; focusId?: string; population?: number; /** false = skip the model (rate limited) and use templates */ useLlm?: boolean }

function fmtWhen(times: string[], idx: number, nowIdx: number, lang: "en" | "bm" = "en"): string | null {
  return idx >= 0 && idx < times.length ? whenLabel(times[idx], times[nowIdx] ?? times[idx], lang) : null
}

export async function runAgent(snapshot: Snapshot, opts: AgentOptions = {}): Promise<AgentRun> {
  const now = opts.now ?? new Date()
  const focus: FocusArea = focusById(opts.focusId ?? "kl-east") ?? FOCUS_AREAS[0]
  const times = snapshot.series.map((p) => p.t)
  const apiNow = maxApiNow(snapshot)
  const hottest = snapshot.stations.filter((s) => s.api != null).sort((a, b) => (b.api ?? 0) - (a.api ?? 0))[0] ?? null

  // ---- 1. Watch
  const watchDetails: string[] = []
  for (const s of snapshot.stations) {
    watchDetails.push(`DOE ${s.name}: API ${s.api ?? "n/a"} (${s.category}), observed ${s.observedAt.slice(11, 16)}${s.isFallback ? " — carried-over value" : ""}`)
  }
  if (snapshot.stations.length === 0) watchDetails.push("DOE readings unavailable — decisions fall back to the model forecast only.")
  const modelNow = snapshot.series[snapshot.nowIndex]?.usAqi ?? null
  watchDetails.push(
    modelNow != null
      ? `Model (CAMS) US AQI now: ${modelNow}${snapshot.biasNow != null ? `; gap to DOE API ${snapshot.biasNow >= 0 ? "+" : ""}${snapshot.biasNow}` : ""}`
      : "Model air-quality series unavailable",
  )
  const today = snapshot.metDays[0]
  if (today) watchDetails.push(`MET KL today: ${metEn(today.summary)}${today.morning ? ` (morning: ${metEn(today.morning)})` : ""}`)
  const klWarnings = snapshot.metWarnings.filter((w) => w.mentionsKL)
  watchDetails.push(`MET warnings active: ${snapshot.metWarnings.length}, naming Kuala Lumpur: ${klWarnings.length}`)
  watchDetails.push(
    snapshot.status.jps.stale
      ? `JPS flood stations: frozen feed (last update ${snapshot.status.jps.observedAt?.slice(0, 10) ?? "unknown"}) — ignored for decisions.`
      : "JPS flood stations: fresh.",
  )

  // ---- 2. Anticipate
  const adj = snapshot.adjusted
  const peakVal = adj.reduce<number | null>((m, v) => (v != null && (m == null || v > m) ? v : m), null)
  const peakIdx = peakVal == null ? -1 : adj.findIndex((v) => v === peakVal)
  const above100 = firstAbove(adj, 100, snapshot.nowIndex)
  const above200 = firstAbove(adj, 200, snapshot.nowIndex)
  const alreadyAbove = (apiNow ?? adj[snapshot.nowIndex] ?? 0) > 100
  const backBelow = above100 >= 0 ? firstBackBelow(adj, 100, above100) : alreadyAbove ? firstBackBelow(adj, 100, snapshot.nowIndex) : -1
  const forecastPeak = peakVal
  const anticipate: string[] = []
  anticipate.push(
    forecastPeak != null
      ? `Bias-adjusted 48 h forecast peaks at ${forecastPeak} around ${fmtWhen(times, peakIdx, snapshot.nowIndex) ?? "n/a"} (${usAqiCategory(forecastPeak)} on the model scale).`
      : "No forecast available.",
  )
  anticipate.push(
    alreadyAbove
      ? `Already above 100 now${backBelow >= 0 ? `; forecast drops back to 100 or below around ${fmtWhen(times, backBelow, snapshot.nowIndex)}` : "; no clearing within 48 h"}.`
      : above100 >= 0
        ? `Forecast first exceeds 100 around ${fmtWhen(times, above100, snapshot.nowIndex)}.`
        : forecastPeak == null
          ? "Forecast unavailable, so whether conditions will cross 100 is unknown."
          : "Forecast stays at or below 100.",
  )
  if (above200 >= 0) anticipate.push(`Forecast first exceeds 200 around ${fmtWhen(times, above200, snapshot.nowIndex)}.`)
  if (snapshot.rain) {
    anticipate.push(
      `Rain: ${Math.round(snapshot.rain.anyRain12h * 100)}% of ${snapshot.rain.members} AI-ensemble members give ≥1 mm in the next 12 h (rain can reduce haze).`,
    )
  }
  anticipate.push("Forecast is the model's US AQI shifted by today's gap to DOE — indicative, not official.")

  // ---- 3. Simulate (the twin, labelled simulated)
  const win = makeWindow(times, adj, "forecast", snapshot.nowIndex)
  const pop = generatePopulation(focus, opts.population ?? 1200, 20261022)
  // If the haze is already under way, lead times mean nothing: compare "now" options instead.
  const interventions = win.startsAbove
    ? [
        PRESET_INTERVENTIONS[0],
        { id: "generic-now", label: "Generic alert, sent now", leadHours: 0, message: "generic" as const },
        { id: "complete-now", label: "Complete advisory, sent now", leadHours: 0, message: "complete" as const },
      ]
    : [PRESET_INTERVENTIONS[0], PRESET_INTERVENTIONS[1], PRESET_INTERVENTIONS[2], PRESET_INTERVENTIONS[3]]
  const compared = compare(pop, win, interventions)
  const scenarios: ScenarioSummary[] = compared.map(({ outcome, summary }) => ({
    label: outcome.intervention.label,
    leadHours: outcome.intervention.leadHours,
    message: outcome.intervention.message,
    meanExposureHours: round1(summary.meanExposureHours),
    actedBeforeEventPct: round1(summary.actedBeforeEventPct),
    informedPct: round1(summary.informedPct),
  }))
  const baseline = scenarios[0]
  const best = [...scenarios].sort((a, b) => a.meanExposureHours - b.meanExposureHours)[0]
  const simDetails: string[] = [
    `${pop.length.toLocaleString("en-GB")} synthetic residents around ${focus.name} (positions illustrative).`,
    win.eventStart < 0
      ? "No hour above 100 in the next 48 h — nothing to rehearse."
      : win.startsAbove
        ? "The event is already under way, so lead times collapse to 'now'; message quality still matters."
        : `Event starts in about ${win.eventStart} h.`,
    ...scenarios.map(
      (s) => `${s.label}: ${s.meanExposureHours} h exposed outdoors per resident, ${s.actedBeforeEventPct}% acted before the event.`,
    ),
    win.eventStart >= 0 && best.label !== baseline.label
      ? `Best option here: "${best.label}" (${round1(baseline.meanExposureHours - best.meanExposureHours)} h less exposure per resident than no proactive warning).`
      : "No option beats the baseline here.",
    "SIMULATED · illustrative persona defaults, not calibrated to a KL survey.",
  ]

  // ---- 4. Decide
  const refNow = apiNow ?? adj[snapshot.nowIndex] ?? null
  const level: Level = maxLevel(levelFromIndex(refNow), levelFromIndex(forecastPeak))
  const autonomy = autonomyFor(level)
  const policy = policyFor(Math.max(refNow ?? 0, forecastPeak ?? 0))
  const noData = refNow == null && forecastPeak == null
  const dataGap = refNow == null || forecastPeak == null
  const rationale = noData
    ? "No air-quality data is available (the DOE feed and the model forecast are both down), so the agent cannot assess risk and sends nothing. Follow DOE and MET Malaysia directly until the feeds return."
    : level === "Green"
      ? refNow == null
        ? "No DOE reading is available; the 48 h model forecast stays at or below 100. Nothing needs sending, but this rests on the model alone."
        : forecastPeak == null
          ? "The current DOE reading is at or below 100, but no forecast is available, so the next 48 h are unknown. Nothing to send now."
          : "Both the current DOE reading and the 48 h forecast are at or below 100. Nothing needs sending — doing nothing is a valid output."
      : `Level ${level}: highest of current DOE API (${refNow ?? "n/a"}) and forecast peak (${forecastPeak ?? "n/a"}). ${
          autonomy === "needs-approval"
            ? "Orange and Red advisories wait for a human to approve; Red is never auto-sent."
            : "Low-risk advisories may auto-send."
        }`
  const decideDetails = [rationale, ...policy.statements.map((s) => `${s.text} (${s.source})`)]

  // ---- 5. Act
  const stationName = hottest?.name ?? null
  const category = doeCategory(refNow)
  const ctx: AdvisoryContext = {
    level,
    apiNow: refNow,
    stationName,
    category: category === "No data" ? usAqiCategory(forecastPeak) : category,
    forecastPeak,
    peakTime: fmtWhen(times, peakIdx, snapshot.nowIndex),
    clearTime: fmtWhen(times, backBelow, snapshot.nowIndex),
    peakTimeBm: fmtWhen(times, peakIdx, snapshot.nowIndex, "bm"),
    clearTimeBm: fmtWhen(times, backBelow, snapshot.nowIndex, "bm"),
  }
  const facts: Facts = {
    numbers: [...ALWAYS_ALLOWED, ...[refNow, forecastPeak].filter((n): n is number => n != null)],
    maxLevel: level,
    apiNow: refNow,
    forecastPeak,
  }

  let llm: AgentRun["llm"] = "template"
  let llmNote: string | undefined
  let modelMessages: z.infer<typeof ModelOutputSchema>["advisories"] | null = null
  if (level !== "Green") {
    if (!llmConfigured()) {
      llmNote = "No ANTHROPIC_API_KEY configured: advisories are deterministic templates."
    } else if (opts.useLlm === false) {
      llmNote = "Too many model requests from this connection just now: advisories are deterministic templates. Try again in a minute."
    } else {
      try {
        const out = await generateJson({
          system: SYSTEM,
          user: JSON.stringify({
            level,
            apiNow: refNow,
            station: stationName,
            category: ctx.category,
            forecastPeak,
            peakTime: ctx.peakTime,
            peakTimeBm: ctx.peakTimeBm,
            clearsBelow100Around: ctx.clearTime,
            clearsBelow100AroundBm: ctx.clearTimeBm,
            policy: policy.statements.map((s) => s.text),
            audiences: AUDIENCES,
          }),
          schema: ModelOutputSchema,
          // 4 audiences x 2 languages x 5 fields overflows the default limit and truncates the JSON mid-array.
          maxTokens: 4096,
        })
        modelMessages = out.advisories
        llm = "claude"
      } catch (e) {
        llmNote =
          e instanceof LlmNotConfigured
            ? "No ANTHROPIC_API_KEY configured: advisories are deterministic templates."
            : `Model call failed (${e instanceof Error ? e.message.slice(0, 120) : "unknown"}); using templates.`
      }
    }
  }

  const advisories: Advisory[] = []
  let replaced = 0
  if (level !== "Green") {
    for (const audience of AUDIENCES as PersonaGroup[]) {
      const fromModel = modelMessages?.find((m) => m.audience === audience)
      let source: Advisory["source"] = "claude"
      let msg = fromModel ? { en: fromModel.en, bm: fromModel.bm } : null
      let guardrails = msg ? checkAdvisory(msg.en, msg.bm, facts) : null
      if (!msg || !guardrails || !guardrails.passed) {
        if (msg) replaced++
        source = "template"
        msg = templateMessage(audience, ctx)
        guardrails = checkAdvisory(msg.en, msg.bm, facts)
      }
      advisories.push({
        id: `${audience}`,
        audience,
        level,
        en: msg.en,
        bm: msg.bm,
        source,
        guardrails,
        // Orange/Red never auto-send; a message that still fails guardrails is blocked outright.
        status: !guardrails.passed ? "blocked" : autonomy === "auto-send" ? "auto-sent" : "pending-approval",
      })
    }
    if (replaced > 0) {
      llmNote = `${replaced} model advisor${replaced === 1 ? "y" : "ies"} failed the guardrails and ${replaced === 1 ? "was" : "were"} replaced by templates.`
    }
  }

  const actDetails =
    level === "Green"
      ? ["No advisory generated."]
      : advisories.map(
          (a) =>
            `${a.audience}: ${a.status} · ${a.source} · guardrails ${a.guardrails.passed ? "passed" : "FAILED"}`,
        )

  const steps: AgentStep[] = [
    { id: "watch", title: "Watch", summary: `${snapshot.stations.length} DOE stations, model series, MET and JPS checked`, details: watchDetails },
    { id: "anticipate", title: "Anticipate", summary: "Act on the forecast, not the threshold crossing", details: anticipate },
    { id: "simulate", title: "Simulate", summary: `Rehearse the warning on ${pop.length.toLocaleString("en-GB")} synthetic residents (simulated)`, details: simDetails },
    { id: "decide", title: "Decide", summary: `Level ${level} · ${autonomy === "auto-send" ? "may auto-send" : "needs human approval"}`, details: decideDetails },
    { id: "act", title: "Act", summary: level === "Green" ? (noData ? "Nothing sent: no data" : "Nothing to send") : `${advisories.length} advisories drafted (EN + BM)`, details: actDetails },
  ]

  return {
    generatedAt: now.toISOString(),
    llm,
    llmNote,
    steps,
    decision: { level, autonomy, rationale, ...(dataGap ? { dataGap } : {}) },
    simulation: { focusArea: focus.name, simulated: true, calibration: "illustrative", scenarios },
    advisories,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// Re-exported for the twin page's quick summary.
export { summarize }

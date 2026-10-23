/**
 * The agent's initiative engine (D-28). Pure functions: given what it saw last time and what it sees now,
 * decide what is worth raising WITHOUT being asked, and rehearse the options on the twin itself.
 * The React side (components/kl/agent-provider.tsx) only schedules these and shows the results.
 *
 * Reactive tool: waits for a click, answers. Proactive agent: keeps watching, notices a change or a coming
 * threshold crossing, does the rehearsal and the drafting on its own, and comes to the human only for the
 * decisions that are theirs (apply a plan, approve a send). Everything here is deterministic and grounded in
 * the snapshot; only the advisory drafting (done elsewhere) uses the model.
 */
import type { Advisory, Level, Snapshot } from "./types"
import { focusById } from "./geo"
import { doeCategory, firstAbove, levelFromIndex, maxLevel, whenLabel } from "./scoring"
import { compare, generatePopulation, makeWindow } from "@/lib/twin/engine"
import { PRESET_INTERVENTIONS } from "@/lib/twin/personas"

export type InitiativeKind = "watch" | "anticipate" | "alert" | "recovery" | "rehearsal" | "draft" | "data"
export type Tone = "info" | "safe" | "watch" | "alert" | "severe"

export type InitiativeAction =
  | { id: string; label: string; type: "apply"; interventionId: string; focusId: string }
  | { id: string; label: string; type: "approve" }
  | { id: string; label: string; type: "open"; href: string }
  | { id: string; label: string; type: "dismiss" }

export type Initiative = {
  id: string
  at: string
  kind: InitiativeKind
  tone: Tone
  title: string
  body: string
  /** The agent did this on its own (watching, rehearsing, drafting). */
  auto: boolean
  /** What the human has to decide, if anything. */
  needsYou?: "decision" | "approval"
  actions?: InitiativeAction[]
  status: "open" | "done" | "dismissed"
  advisories?: Advisory[]
  level?: Level
}

export type Memory = {
  lastLevel: Level | null
  lastApi: number | null
  /** Time label of the forecast crossing it already warned about. */
  crossKey: string | null
  dataDown: boolean
  draftKey: string | null
  rehearsalKey: string | null
}

export const EMPTY_MEMORY: Memory = { lastLevel: null, lastApi: null, crossKey: null, dataDown: false, draftKey: null, rehearsalKey: null }

export type Recommendation = {
  focusId: string
  focusName: string
  residents: number
  bestId: string
  bestLabel: string
  baselineExposure: number
  bestExposure: number
  reductionPct: number
  workerBaseline: number
  workerBest: number
  options: { id: string; label: string; exposure: number }[]
}

export type Observation = { memory: Memory; initiatives: Initiative[]; wantsDraft: boolean; level: Level }

const SEED = 20261022
const round1 = (n: number) => Math.round(n * 10) / 10

function maxApi(s: Snapshot): number | null {
  return s.stations.reduce<number | null>((m, st) => (st.api != null && (m == null || st.api > m) ? st.api : m), null)
}

function forecastPeak(s: Snapshot): { peak: number | null; idx: number } {
  let peak: number | null = null
  let idx = -1
  for (let i = Math.max(0, s.nowIndex); i < s.adjusted.length; i++) {
    const v = s.adjusted[i]
    if (v != null && (peak == null || v > peak)) {
      peak = v
      idx = i
    }
  }
  return { peak, idx }
}

/** Rehearse every option on the twin and pick the one that leaves residents least exposed. Null if nothing to rehearse. */
export function recommend(snapshot: Snapshot, focusId = "kl-east", population = 1200): Recommendation | null {
  const times = snapshot.series.map((p) => p.t)
  const win = makeWindow(times, snapshot.adjusted, "forecast", snapshot.nowIndex)
  if (win.eventStart < 0) return null
  const focus = focusById(focusId)
  const pop = generatePopulation(focus, population, SEED)
  const res = compare(pop, win, PRESET_INTERVENTIONS, SEED)
  const worker = (i: number) => res[i].summary.byPersona.find((p) => p.persona === "outdoor-worker")?.meanExposureHours ?? 0
  let best = 0
  res.forEach((r, i) => {
    if (r.summary.meanExposureHours < res[best].summary.meanExposureHours - 1e-9) best = i
  })
  const base = res[0].summary.meanExposureHours
  return {
    focusId: focus.id,
    focusName: focus.name,
    residents: pop.length,
    bestId: res[best].outcome.intervention.id,
    bestLabel: res[best].outcome.intervention.label,
    baselineExposure: round1(base),
    bestExposure: round1(res[best].summary.meanExposureHours),
    reductionPct: base > 0 ? Math.round((100 * (base - res[best].summary.meanExposureHours)) / base) : 0,
    workerBaseline: round1(worker(0)),
    workerBest: round1(worker(best)),
    options: res.map((r) => ({ id: r.outcome.intervention.id, label: r.outcome.intervention.label, exposure: round1(r.summary.meanExposureHours) })),
  }
}

let counter = 0
const uid = (kind: string, now: Date) => `${kind}-${now.getTime()}-${counter++}`

const LEVEL_TONE: Record<Level, Tone> = { Green: "safe", Orange: "alert", Red: "severe" }

export function observe(prev: Memory | null, snap: Snapshot, now: Date, focusId = "kl-east"): Observation {
  const first = prev == null
  const mem: Memory = { ...(prev ?? EMPTY_MEMORY) }
  const out: Initiative[] = []
  const at = now.toISOString()
  const times = snap.series.map((p) => p.t)
  const nowT = times[snap.nowIndex] ?? times[0]
  const apiNow = maxApi(snap)
  const { peak, idx: peakIdx } = forecastPeak(snap)
  const noData = apiNow == null && peak == null
  const hottest = snap.stations.filter((s) => s.api != null).sort((a, b) => (b.api ?? 0) - (a.api ?? 0))[0] ?? null
  const dayKey = (nowT ?? "").slice(0, 10)
  const level: Level = noData ? (mem.lastLevel ?? "Green") : maxLevel(levelFromIndex(apiNow), levelFromIndex(peak))

  // 1. Feeds going down or coming back: say so before anything else.
  if (noData && !mem.dataDown) {
    out.push({
      id: uid("data", now), at, kind: "data", tone: "severe", auto: true, status: "open",
      title: "I lost the air-quality feeds",
      body: "Neither the DOE readings nor the model forecast are reachable, so I can't assess risk and I won't send anything. Follow DOE and MET Malaysia directly until they return.",
    })
  }
  if (!noData && mem.dataDown) {
    out.push({
      id: uid("data", now), at, kind: "data", tone: "safe", auto: true, status: "done",
      title: "The feeds are back", body: "I can assess risk again and will carry on watching.",
    })
  }
  mem.dataDown = noData
  if (noData) return { memory: mem, initiatives: out, wantsDraft: false, level }

  const where = hottest ? `${hottest.name} reads ${hottest.api} (${doeCategory(hottest.api)})` : "No DOE reading right now"
  const peakText =
    peak != null && peakIdx >= 0 ? `forecast peaks near ${Math.round(peak)} around ${whenLabel(times[peakIdx], nowT)}` : "no forecast available"
  const levelChanged = !first && mem.lastLevel != null && mem.lastLevel !== level
  const rose = levelChanged && (level === "Red" || (level === "Orange" && mem.lastLevel === "Green"))

  // 2. What I noticed.
  if (first) {
    out.push({
      id: uid("watch", now), at, kind: "watch", tone: LEVEL_TONE[level], auto: true, status: "done", level,
      title: level === "Green" ? "I'm watching Kuala Lumpur: all clear" : `I'm watching Kuala Lumpur: level ${level}`,
      body: `${where}; ${peakText}.`,
    })
  } else if (levelChanged) {
    out.push({
      id: uid(rose ? "alert" : "recovery", now), at, kind: rose ? "alert" : "recovery", tone: LEVEL_TONE[level], auto: true, status: "done", level,
      title: rose ? `Level rose to ${level}` : `Easing: level ${level}`,
      body: `${where}; ${peakText}.${rose ? " Orange and Red advisories need a human to approve; I never auto-send Red." : ""}`,
    })
  } else if (prev?.lastApi != null && apiNow != null && apiNow - prev.lastApi >= 15) {
    out.push({
      id: uid("watch", now), at, kind: "watch", tone: LEVEL_TONE[level], auto: true, status: "done", level,
      title: `Reading jumped by ${apiNow - prev.lastApi}`, body: `${where}; ${peakText}.`,
    })
  }

  // 3. A crossing that hasn't happened yet: this is the early-warning window.
  const crossIdx = (apiNow ?? 0) > 100 ? -1 : firstAbove(snap.adjusted, 100, snap.nowIndex + 1)
  const crossKey = crossIdx >= 0 ? times[crossIdx] : null
  if (crossKey && crossKey !== mem.crossKey && crossIdx - snap.nowIndex <= 24) {
    out.push({
      id: uid("anticipate", now), at, kind: "anticipate", tone: "watch", auto: true, status: "done", level,
      title: `Haze expected to cross 100 in about ${crossIdx - snap.nowIndex} h`,
      body: `The forecast first exceeds 100 around ${whenLabel(crossKey, nowT)}. That is the window to warn people early, so I'm rehearsing the options.`,
    })
  }
  mem.crossKey = crossKey

  // 4. Rehearse on my own, then come to the human with a recommendation.
  const rehearsalKey = `${level}:${focusId}:${dayKey}`
  const wantsRehearsal = level !== "Green" || crossKey != null
  if (wantsRehearsal && (first || levelChanged || mem.rehearsalKey !== rehearsalKey)) {
    const rec = recommend(snap, focusId)
    if (rec) {
      const siteLine =
        rec.workerBaseline > 0
          ? ` Outdoor crews stay the most exposed group (${rec.workerBaseline} h without action${rec.workerBest < rec.workerBaseline ? `, ${rec.workerBest} h with it` : ""}).`
          : ""
      out.push({
        id: uid("rehearsal", now), at, kind: "rehearsal", tone: "info", auto: true, needsYou: "decision", status: "open", level,
        title: `I rehearsed ${rec.options.length} options on ${rec.residents.toLocaleString("en-GB")} residents around ${rec.focusName}`,
        body: `Best: ${rec.bestLabel}, about ${rec.reductionPct}% less outdoor exposure than doing nothing (simulated, illustrative parameters).${siteLine}`,
        actions: [
          { id: "apply", label: "Show it on the twin", type: "apply", interventionId: rec.bestId, focusId: rec.focusId },
          { id: "dismiss", label: "Not now", type: "dismiss" },
        ],
      })
    }
    mem.rehearsalKey = rehearsalKey
  }

  // 5. Drafting is the agent's job too: ask the caller to draft once per level per day.
  const draftKey = `${level}:${dayKey}`
  const wantsDraft = level !== "Green" && mem.draftKey !== draftKey
  if (wantsDraft) mem.draftKey = draftKey

  mem.lastLevel = level
  mem.lastApi = apiNow
  return { memory: mem, initiatives: out, wantsDraft, level }
}

/** The initiative the agent files after it has drafted advisories on its own. */
export function draftInitiative(now: Date, level: Level, advisories: Advisory[], viaModel: boolean): Initiative {
  const pending = advisories.filter((a) => a.status === "pending-approval").length
  return {
    id: uid("draft", now), at: now.toISOString(), kind: "draft", tone: level === "Red" ? "severe" : "alert", auto: true, level,
    needsYou: pending > 0 ? "approval" : undefined,
    status: pending > 0 ? "open" : "done",
    title: `I drafted ${advisories.length} advisories (EN + BM) for level ${level}`,
    body: `${viaModel ? "Written by Claude and checked against the data" : "Templates, checked against the data"}. ${pending} wait for your approval; nothing is sent without it.`,
    advisories,
    actions:
      pending > 0
        ? [
            { id: "approve", label: "Approve all", type: "approve" },
            { id: "open", label: "Review", type: "open", href: "/agent" },
            { id: "dismiss", label: "Not now", type: "dismiss" },
          ]
        : [{ id: "open", label: "Review", type: "open", href: "/agent" }],
  }
}

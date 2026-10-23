import type { FocusArea } from "@/lib/kl/types"
import { MOE_THRESHOLDS } from "@/lib/kl/policy"
import { AMBIENT, DELIVERY, MESSAGE_FACTOR, PERSONAS, PERSONA_BY_ID, SITE_COMPLIANCE, SITE_PROTECT } from "./personas"
import { clamp, hash01, mulberry32, normal } from "./prng"
import type {
  ChannelId,
  Intervention,
  Outcome,
  PersonaId,
  PersonaSummary,
  Resident,
  ResidentState,
  Summary,
  Window,
} from "./types"

const THRESHOLD = MOE_THRESHOLDS.suspendOutdoor

// ------------------------------------------------------------------ population

function pickChannel(p: Record<ChannelId, number>, u: number): ChannelId {
  let acc = 0
  for (const c of ["whatsapp", "official", "social", "none"] as ChannelId[]) {
    acc += p[c]
    if (u < acc) return c
  }
  return "none"
}

/**
 * Synthetic residents scattered around a focus area. Positions are illustrative (not real
 * addresses and not building-accurate); they exist so the map can show the population.
 */
export function generatePopulation(focus: FocusArea, n: number, seed: number): Resident[] {
  const rand = mulberry32(seed)
  const out: Resident[] = []
  const cosLat = Math.cos((focus.lat * Math.PI) / 180)
  for (let i = 0; i < n; i++) {
    const uPersona = rand()
    let acc = 0
    let persona: PersonaId = PERSONAS[PERSONAS.length - 1].id
    for (const p of PERSONAS) {
      acc += p.share
      if (uPersona < acc) {
        persona = p.id
        break
      }
    }
    const angle = rand() * Math.PI * 2
    const r = focus.radiusM * Math.sqrt(rand())
    const lat = focus.lat + (r * Math.cos(angle)) / 111_320
    const lon = focus.lon + (r * Math.sin(angle)) / (111_320 * cosLat)
    const channel = pickChannel(PERSONA_BY_ID[persona].channels, rand())
    const trust = clamp(0.65 + 0.18 * normal(rand), 0.05, 1)
    // Commuting personas travel further from home when outdoors; others stay local.
    const far = persona === "commuter" || persona === "outdoor-worker" || persona === "shift-worker" || persona === "student"
    const dAngle = rand() * Math.PI * 2
    const dR = focus.radiusM * (far ? 0.7 + rand() * 1.1 : 0.1 + rand() * 0.35)
    const destLat = lat + (dR * Math.cos(dAngle)) / 111_320
    const destLon = lon + (dR * Math.sin(dAngle)) / (111_320 * cosLat)
    out.push({ id: i, persona, lat, lon, channel, trust, destLat, destLon })
  }
  return out
}

// ------------------------------------------------------------------ scenario window

function firstAbove(values: number[], threshold: number): number {
  for (let i = 0; i < values.length; i++) if (values[i] > threshold) return i
  return -1
}

export function makeWindow(
  times: string[],
  values: (number | null)[],
  mode: "forecast" | "replay",
  nowIndex: number,
  length = 48,
): Window {
  let start = nowIndex
  let label = "Next 48 hours (live forecast, bias-adjusted — indicative)"
  // In a replay the event is the chosen onset itself, even if the real series had a smaller bump earlier.
  let onset = -1
  if (mode === "replay") {
    // Find real onsets: the first hour above the threshold after at least 6 hours at or below it.
    // Prefer the onset followed by the worst peak in the next 36 h, and start 24 h earlier so the
    // warning lead times have room to matter.
    let best = -1
    let bestPeak = -1
    const lead = Math.floor(length / 2)
    for (let i = 6; i <= nowIndex && i < values.length; i++) {
      const v = values[i]
      if (v == null || v <= THRESHOLD) continue
      let calm = true
      for (let k = i - 6; k < i; k++) if (values[k] == null || (values[k] as number) > THRESHOLD) calm = false
      if (!calm || i - lead < 0) continue
      let peak = 0
      for (let k = i; k < Math.min(values.length, i + 36); k++) peak = Math.max(peak, values[k] ?? 0)
      if (peak > bestPeak) {
        bestPeak = peak
        best = i
      }
    }
    if (best >= 0) {
      start = best - lead
      onset = lead
      label = "Replay of a real haze onset (model values, from the last three weeks)"
    } else {
      // No clean onset in the history: centre on the highest value instead.
      let peak = 0
      let peakVal = -1
      for (let i = 0; i <= nowIndex && i < values.length; i++) {
        const v = values[i]
        if (v != null && v > peakVal) {
          peakVal = v
          peak = i
        }
      }
      start = clamp(peak - 30, 0, Math.max(0, nowIndex - 1))
      label = "Replay centred on the highest recent value (no clean onset in the history)"
    }
  }
  const end = Math.min(times.length, start + length)
  const t = times.slice(start, end)
  const v = values.slice(start, end).map((x) => (x == null ? 0 : x))
  const eventStart = onset >= 0 ? onset : firstAbove(v, THRESHOLD)
  return { kind: mode, label, times: t, values: v, eventStart, startsAbove: eventStart === 0 }
}

export function hourOfDay(window: Window, index: number): number {
  return Number(window.times[index]?.slice(11, 13) ?? 0)
}

// ------------------------------------------------------------------ simulation

/**
 * Per-resident decision chain (all parameters illustrative, D-23):
 *   reached by the warning? -> learns at sendHour + 0..2 h
 *   (or hears ambiently 2..6 h after the event starts)
 *   convinced & able? p = baseAct * (0.4 + 0.6 * trust) * messageFactor * leadFactor
 *   acts 0..1 h after learning; exposure outdoors above the threshold is then scaled by `protect`.
 */
export function simulate(pop: Resident[], win: Window, iv: Intervention, seed = 1): Outcome {
  const n = pop.length
  const informedHour = new Int16Array(n).fill(-1)
  const actHour = new Int16Array(n).fill(-1)
  const siteHour = new Int16Array(n).fill(-1)
  const exposure = new Float32Array(n)
  const len = win.values.length
  const event = win.eventStart
  const sendHour = iv.leadHours == null || event < 0 ? null : Math.max(0, event - iv.leadHours)
  const siteSend = iv.siteAction && event >= 0 ? Math.max(0, event - (iv.leadHours ?? 0)) : null

  for (let i = 0; i < n; i++) {
    const r = pop[i]
    const persona = PERSONA_BY_ID[r.persona]
    const u1 = hash01(r.id, 1, seed)
    const u2 = hash01(r.id, 2, seed)
    const u3 = hash01(r.id, 3, seed)
    const u4 = hash01(r.id, 4, seed)
    const u5 = hash01(r.id, 5, seed)

    let learned = -1
    let viaWarning = false
    if (event >= 0) {
      if (sendHour != null && u1 < DELIVERY[r.channel]) {
        learned = sendHour + Math.floor(u2 * 3)
        viaWarning = true
      }
      if (u3 < AMBIENT[r.channel]) {
        const ambient = event + 2 + Math.floor(hash01(r.id, 6, seed) * 5)
        if (learned < 0 || ambient < learned) {
          learned = ambient
          viaWarning = false
        }
      }
    }
    if (learned >= len) learned = -1
    informedHour[i] = learned

    if (learned >= 0) {
      const msg = viaWarning ? MESSAGE_FACTOR[iv.message] : MESSAGE_FACTOR.generic
      const beforeEvent = learned <= event
      const leadFactor = beforeEvent ? (event - learned > 12 ? 0.8 : 1) : 0.85
      const p = clamp(persona.baseAct * (0.4 + 0.6 * r.trust) * msg * leadFactor, 0, 1)
      if (u4 < p) actHour[i] = Math.min(len - 1, learned + (u5 < 0.5 ? 0 : 1))
    }

    // A site manager who gets the notification reschedules the crew's heavy outdoor work an hour later.
    if (siteSend != null && r.persona === "outdoor-worker" && hash01(r.id, 7, seed) < SITE_COMPLIANCE) {
      siteHour[i] = Math.min(len - 1, siteSend + 1)
    }

    let exp = 0
    for (let h = 0; h < len; h++) {
      if (win.values[h] <= THRESHOLD) continue
      const out = persona.outdoor[hourOfDay(win, h)]
      const protectedNow = actHour[i] >= 0 && h >= actHour[i]
      const siteNow = siteHour[i] >= 0 && h >= siteHour[i]
      exp += out * Math.min(protectedNow ? persona.protect : 1, siteNow ? SITE_PROTECT : 1)
    }
    exposure[i] = exp
  }
  return { intervention: iv, informedHour, actHour, siteHour, exposure, sendHour }
}

export function summarize(pop: Resident[], win: Window, out: Outcome): Summary {
  const n = pop.length || 1
  let informed = 0
  let acted = 0
  let actedBefore = 0
  let siteManaged = 0
  let totalExp = 0
  const per = new Map<PersonaId, { n: number; exp: number; acted: number }>()
  for (let i = 0; i < pop.length; i++) {
    const p = per.get(pop[i].persona) ?? { n: 0, exp: 0, acted: 0 }
    p.n++
    p.exp += out.exposure[i]
    if (out.informedHour[i] >= 0) informed++
    if (out.actHour[i] >= 0) {
      acted++
      p.acted++
      if (win.eventStart >= 0 && out.actHour[i] <= win.eventStart) actedBefore++
    }
    if (out.siteHour[i] >= 0) siteManaged++
    totalExp += out.exposure[i]
    per.set(pop[i].persona, p)
  }
  const byPersona: PersonaSummary[] = PERSONAS.map((p) => {
    const v = per.get(p.id) ?? { n: 0, exp: 0, acted: 0 }
    return {
      persona: p.id,
      n: v.n,
      meanExposureHours: v.n ? v.exp / v.n : 0,
      actedPct: v.n ? (100 * v.acted) / v.n : 0,
    }
  })
  return {
    residents: pop.length,
    informedPct: (100 * informed) / n,
    actedPct: (100 * acted) / n,
    actedBeforeEventPct: (100 * actedBefore) / n,
    siteManagedPct: (100 * siteManaged) / n,
    meanExposureHours: totalExp / n,
    byPersona,
  }
}

export function compare(
  pop: Resident[],
  win: Window,
  ivs: Intervention[],
  seed = 1,
): { outcome: Outcome; summary: Summary }[] {
  return ivs.map((iv) => {
    const outcome = simulate(pop, win, iv, seed)
    return { outcome, summary: summarize(pop, win, outcome) }
  })
}

// ------------------------------------------------------------------ per-hour views (for the map and charts)

/**
 * Where each resident is drawn at hour h: home when indoors, moving toward their destination as the
 * persona's outdoor probability for that hour rises. Animation only; it does not affect outcomes.
 */
export function positionsAt(pop: Resident[], win: Window, h: number): Float64Array {
  const out = new Float64Array(pop.length * 2)
  const hod = hourOfDay(win, h)
  for (let i = 0; i < pop.length; i++) {
    const r = pop[i]
    const w = Math.min(1, PERSONA_BY_ID[r.persona].outdoor[hod] * 1.3)
    out[i * 2] = r.lon + (r.destLon - r.lon) * w
    out[i * 2 + 1] = r.lat + (r.destLat - r.lat) * w
  }
  return out
}

/** Is this resident outdoors at hour h? (Deterministic sample of the persona's outdoor probability.) */
export function isOutdoors(r: Resident, win: Window, h: number, seed = 1): boolean {
  return hash01(r.id, 1000 + h, seed) < PERSONA_BY_ID[r.persona].outdoor[hourOfDay(win, h)]
}

export function stateAt(r: Resident, out: Outcome, win: Window, h: number, seed = 1): ResidentState {
  const informed = out.informedHour[r.id] >= 0 && h >= out.informedHour[r.id]
  const prot = (out.actHour[r.id] >= 0 && h >= out.actHour[r.id]) || (out.siteHour[r.id] >= 0 && h >= out.siteHour[r.id])
  if (!prot && win.values[h] > THRESHOLD && isOutdoors(r, win, h, seed)) return "exposed"
  if (prot) return "protected"
  if (informed) return "informed"
  return "unaware"
}

/** Counts of each state at every hour, for the live chart. */
export function stateSeries(pop: Resident[], out: Outcome, win: Window, seed = 1): Record<ResidentState, number>[] {
  const res: Record<ResidentState, number>[] = []
  for (let h = 0; h < win.values.length; h++) {
    const c: Record<ResidentState, number> = { unaware: 0, informed: 0, protected: 0, exposed: 0 }
    for (const r of pop) c[stateAt(r, out, win, h, seed)]++
    res.push(c)
  }
  return res
}

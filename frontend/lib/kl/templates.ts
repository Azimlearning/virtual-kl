import type { Level, MessageParts, PersonaGroup } from "./types"

/**
 * Deterministic fallback advisories, used when no Anthropic key is configured or when a model
 * advisory fails the guardrails. They are always labelled source: "template" in the UI.
 */

export type AdvisoryContext = {
  level: Level
  apiNow: number | null
  stationName: string | null
  category: string
  forecastPeak: number | null
  peakTime: string | null
  clearTime: string | null
  /** Malay variants ("8 PM esok"); fall back to the English label when absent. */
  peakTimeBm?: string | null
  clearTimeBm?: string | null
}

const AUDIENCE_LABEL: Record<PersonaGroup, { en: string; bm: string }> = {
  "parents-schools": { en: "Parents and schools", bm: "Ibu bapa dan sekolah" },
  "elderly-respiratory": { en: "Older residents and people with breathing conditions", bm: "Warga emas dan pesakit pernafasan" },
  "outdoor-workers": { en: "Outdoor and shift workers", bm: "Pekerja luar dan bekerja syif" },
  general: { en: "All residents", bm: "Semua penduduk" },
}

export const AUDIENCES: PersonaGroup[] = ["parents-schools", "elderly-respiratory", "outdoor-workers", "general"]

export function audienceLabel(g: PersonaGroup) {
  return AUDIENCE_LABEL[g]
}

const ACTIONS: Record<PersonaGroup, { en: string; bm: string }> = {
  "parents-schools": {
    en: "Keep outdoor school activities indoors and have children wear a mask outside.",
    bm: "Adakan aktiviti sekolah di dalam bangunan dan pastikan kanak-kanak memakai pelitup muka di luar.",
  },
  "elderly-respiratory": {
    en: "Stay indoors with windows closed where you can, keep medication within reach, and wear an N95 mask if you must go out.",
    bm: "Kekal di dalam rumah dengan tingkap ditutup jika boleh, sediakan ubat, dan pakai pelitup N95 jika perlu keluar.",
  },
  "outdoor-workers": {
    en: "Wear an N95 mask, take regular breaks in clean indoor air, drink water, and ask your employer to reduce heavy outdoor work.",
    bm: "Pakai pelitup N95, berehat di tempat tertutup yang bersih, minum air, dan minta majikan kurangkan kerja luar yang berat.",
  },
  general: {
    en: "Limit outdoor exercise, wear a mask outdoors, and keep windows closed.",
    bm: "Kurangkan senaman di luar, pakai pelitup muka di luar, dan tutup tingkap.",
  },
}

export function templateMessage(group: PersonaGroup, ctx: AdvisoryContext): { en: MessageParts; bm: MessageParts } {
  const where = ctx.stationName ?? "Kuala Lumpur"
  const reading = ctx.apiNow != null ? `${ctx.apiNow}` : null
  const catBm: Record<string, string> = {
    Good: "Baik",
    Moderate: "Sederhana",
    Unhealthy: "Tidak sihat",
    "Very Unhealthy": "Sangat tidak sihat",
    Hazardous: "Berbahaya",
  }

  const whatEn = reading
    ? `Air quality is ${ctx.category} (API ${reading}) at the ${where} station.`
    : `Air quality in Kuala Lumpur is expected to be ${ctx.category}.`
  const whatBm = reading
    ? `Kualiti udara ${catBm[ctx.category] ?? ctx.category} (API ${reading}) di stesen ${where}.`
    : `Kualiti udara di Kuala Lumpur dijangka ${catBm[ctx.category] ?? ctx.category}.`

  const whenEn = ctx.clearTime
    ? `Likely above 100 until about ${ctx.clearTime}.`
    : ctx.peakTime
      ? `Highest around ${ctx.peakTime}.`
      : "Conditions are expected to continue for the next 48 hours."
  const whenBm = ctx.clearTime
    ? `Dijangka melebihi 100 sehingga kira-kira ${ctx.clearTimeBm ?? ctx.clearTime}.`
    : ctx.peakTime
      ? `Paling tinggi sekitar ${ctx.peakTimeBm ?? ctx.peakTime}.`
      : "Keadaan dijangka berterusan dalam 48 jam akan datang."

  const a = ACTIONS[group]
  return {
    en: {
      headline: `${ctx.level === "Red" ? "Serious" : "Unhealthy"} haze: ${AUDIENCE_LABEL[group].en.toLowerCase()}`,
      what: whatEn,
      where: `Kuala Lumpur (${where}).`,
      when: whenEn,
      action: a.en,
    },
    bm: {
      headline: `Jerebu ${ctx.level === "Red" ? "serius" : "tidak sihat"}: ${AUDIENCE_LABEL[group].bm.toLowerCase()}`,
      what: whatBm,
      where: `Kuala Lumpur (${where}).`,
      when: whenBm,
      action: a.bm,
    },
  }
}

import type { GuardrailResult, Level, MessageParts } from "./types"

/**
 * Guardrails for AI-written text that reaches people (D-08, preflight Q5). TypeScript port of
 * the ideas in CISE's app/intelligence/guardrails.py, extended for resident advisories:
 *   1. numbers must come from the facts we gave the model (numeric grounding)
 *   2. the message must not claim a higher alert level than the data supports (domain constraint)
 *   3. no claims we can't back (closed schools, evacuation, official orders)
 *   4. complete: what / where / when / action are all present
 */

export type Facts = {
  /** Every number the message is allowed to contain (rounded). */
  numbers: number[]
  maxLevel: Level
  apiNow: number | null
  forecastPeak: number | null
}

const STRIP = [
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi,
  /\b\d{1,2}:\d{2}\b/g,
  /\b(?:pukul|jam)\s?\d{1,2}(?:[.:]\d{2})?\b/gi,
  /\b\d{1,2}\s?(?:hours?|hrs?|jam|minutes?|minit|min)\b/gi,
  /\b\d{1,2}\s?(?:oct|okt)[a-z]*\b/gi,
]

export function extractNumbers(text: string): number[] {
  let t = text
  for (const re of STRIP) t = t.replace(re, " ")
  return (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

const PARTS: (keyof MessageParts)[] = ["headline", "what", "where", "when", "action"]

function flat(m: MessageParts): string {
  return PARTS.map((k) => m[k]).join(" \n ")
}

export function checkAdvisory(en: MessageParts, bm: MessageParts, facts: Facts): GuardrailResult {
  const allowed = new Set(facts.numbers.map((n) => Math.round(n)))
  const text = `${flat(en)}\n${flat(bm)}`

  const unknownNumbers = extractNumbers(text).filter((n) => !allowed.has(Math.round(n)))
  const numbersGrounded = unknownNumbers.length === 0

  const claimIssues: string[] = []
  const lower = text.toLowerCase()
  const claimsRed = /\bred (?:alert|level|warning)\b|amaran merah|tahap merah/.test(lower)
  const claimsOrange = /\borange (?:alert|level|warning)\b|amaran oren|tahap oren/.test(lower)
  const levelOk = !(claimsRed && facts.maxLevel !== "Red") && !(claimsOrange && facts.maxLevel === "Green")
  if (!levelOk) claimIssues.push("States a higher alert level than the data supports")

  const over200 = (facts.apiNow ?? 0) > 200 || (facts.forecastPeak ?? 0) > 200
  if (!over200 && /schools?\s+(?:are |will be |have been |to be )?(?:closed|close)\b|sekolah\s+(?:akan\s+)?ditutup/.test(lower)) {
    claimIssues.push("Claims school closure without an API above 200")
  }
  if (/evacuat|pemindahan|berpindah/.test(lower)) claimIssues.push("Tells people to evacuate (not a haze action)")
  if (/ordered by|government has ordered|arahan rasmi|diarahkan oleh kerajaan/.test(lower)) {
    claimIssues.push("Claims an official order we cannot back")
  }
  const claimsOk = claimIssues.length === 0

  const missing: string[] = []
  for (const k of PARTS) {
    if (!en[k] || en[k].trim().length < 3) missing.push(`EN ${k}`)
    if (!bm[k] || bm[k].trim().length < 3) missing.push(`BM ${k}`)
  }
  const complete = missing.length === 0

  return {
    numbersGrounded,
    unknownNumbers,
    levelOk,
    claimsOk,
    claimIssues,
    complete,
    missing,
    passed: numbersGrounded && levelOk && claimsOk && complete,
  }
}

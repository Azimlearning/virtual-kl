// The backend's three automatic checks on every AI brief, translated into
// plain language for non-technical readers. One place for the wording so the
// on-screen panel and the exported documents always say the same thing
// (the backend report builder mirrors this in app/reports.py).

export type Guardrails = {
  /** 0-100: share of the AI's key words that also appear in the source records. */
  groundingPct: number
  /** Every number in the AI text also appears in the source records. */
  numbersVerified: boolean
  /** Alert levels the AI mentions (Red/Orange/Green) exist in the source records. */
  levelsConsistent: boolean
  /** The AI answered in the required structured format. */
  formatValid: boolean
  /** Passed all checks AND at least one source is Orange/Red. */
  alertWorthy: boolean
}

// 20% is the same floor the backend uses before a brief can trigger an alert
// (_is_alert_worthy in app/intelligence/rag.py); 50% is a display-only "strong" band.
export function groundingBand(pct: number): "strong" | "partial" | "weak" {
  if (pct >= 50) return "strong"
  if (pct >= 20) return "partial"
  return "weak"
}

export function guardrailLines(g: Guardrails): string[] {
  const band = groundingBand(g.groundingPct)
  const bandText = band === "strong" ? "strong" : band === "partial" ? "partial" : "weak"
  return [
    `Wording matches the source data (${bandText}): ${g.groundingPct}% of the AI's key words appear in the retrieved records.`,
    g.numbersVerified
      ? "Numbers and dates verified: every number and month named in the AI text appears in the source records."
      : "Numbers or dates NOT verified: the AI text contains a number or month that is not in the source records. Check before use.",
    g.levelsConsistent
      ? "Alert levels consistent: the alert levels the AI mentions match the source records."
      : "Alert levels NOT consistent: the AI text mentions an alert level not present in the source records. Check before use.",
  ]
}

import type { Level } from "./types"
import { levelFromIndex } from "./scoring"

/**
 * Official haze action thresholds (Ministry of Education, reported by The Star 2026-10-07):
 *  - API > 100: suspend outdoor student activities
 *  - API > 200: close schools in the affected area
 * DOE advice (via TechNave 2026-04): wear a face mask once API goes over 100.
 * These apply to the *official DOE API*, not to the model forecast, so anything derived
 * from the forecast is "indicative".
 */
export const MOE_THRESHOLDS = { suspendOutdoor: 100, closeSchools: 200 } as const

export type PolicyStatement = { text: string; source: string }

const MOE_SOURCE = "MOE statement, The Star 2026-10-07"
const DOE_SOURCE = "DOE guidance, TechNave 2026-04-03"

export function policyFor(indexValue: number | null): { level: Level; statements: PolicyStatement[] } {
  const level = levelFromIndex(indexValue)
  if (level === "Red") {
    return {
      level,
      statements: [
        { text: "Schools in the affected area close (API above 200).", source: MOE_SOURCE },
        { text: "Outdoor student activities are suspended (API above 100).", source: MOE_SOURCE },
        { text: "Wear a face mask outdoors (API above 100).", source: DOE_SOURCE },
      ],
    }
  }
  if (level === "Orange") {
    return {
      level,
      statements: [
        { text: "Outdoor student activities are suspended (API above 100).", source: MOE_SOURCE },
        { text: "Wear a face mask outdoors (API above 100).", source: DOE_SOURCE },
      ],
    }
  }
  return { level, statements: [] }
}

/** Autonomy ladder (D-08): Green may auto-send; Orange and Red wait for a human; Red is never auto-sent. */
export function autonomyFor(level: Level): "auto-send" | "needs-approval" {
  return level === "Green" ? "auto-send" : "needs-approval"
}

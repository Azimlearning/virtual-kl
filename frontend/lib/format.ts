export type SeverityLabel = "critical" | "high" | "moderate" | "low"

export function severityFromScore(score: number): SeverityLabel {
  if (score >= 80) return "critical"
  if (score >= 60) return "high"
  if (score >= 35) return "moderate"
  return "low"
}

export const SEVERITY_META: Record<
  SeverityLabel,
  { label: string; dot: string; text: string; border: string; bg: string }
> = {
  critical: {
    label: "Critical",
    dot: "bg-[var(--chart-5)]",
    text: "text-[var(--chart-5)]",
    border: "border-[var(--chart-5)]/40",
    bg: "bg-[var(--chart-5)]/10",
  },
  high: {
    label: "High",
    dot: "bg-[var(--chart-4)]",
    text: "text-[var(--chart-4)]",
    border: "border-[var(--chart-4)]/40",
    bg: "bg-[var(--chart-4)]/10",
  },
  moderate: {
    label: "Moderate",
    dot: "bg-[var(--chart-2)]",
    text: "text-[var(--chart-2)]",
    border: "border-[var(--chart-2)]/40",
    bg: "bg-[var(--chart-2)]/10",
  },
  low: {
    label: "Low",
    dot: "bg-[var(--chart-1)]",
    text: "text-[var(--chart-1)]",
    border: "border-[var(--chart-1)]/40",
    bg: "bg-[var(--chart-1)]/10",
  },
}

export const CATEGORY_LABELS: Record<string, string> = {
  natural_disaster: "Natural Disaster",
  armed_conflict: "Armed Conflict",
  civil_unrest: "Civil Unrest",
  disease_outbreak: "Disease Outbreak",
  humanitarian: "Humanitarian",
  severe_weather: "Severe Weather",
  infrastructure: "Infrastructure",
  other: "Other",
}

export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "10 Jul 2026" - always UTC and always spelled out, so the same record reads
 *  the same on every machine (the UI once showed numeric dates that were
 *  misread as a different month). */
export function formatUtcDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return "unknown date"
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

import type { ReactNode } from "react"
import { AlertTriangle, CheckCircle2, CircleSlash, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Freshness, Level } from "@/lib/kl/types"

export function ago(minutes?: number): string {
  if (minutes == null) return ""
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const h = Math.round(minutes / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

/** Data-freshness receipt shown next to every reading. */
export function FreshnessChip({ label, status, className }: { label: string; status: Freshness; className?: string }) {
  const state = !status.ok ? "down" : status.stale ? "stale" : "live"
  const Icon = state === "live" ? CheckCircle2 : state === "stale" ? Clock : CircleSlash
  const tone =
    state === "live"
      ? "border-safe/30 bg-safe/10 text-safe"
      : state === "stale"
        ? "border-watch/40 bg-watch/10 text-watch"
        : "border-severe/40 bg-severe/10 text-severe"
  const text =
    state === "live"
      ? `live${status.ageMinutes != null ? ` · ${ago(status.ageMinutes)}` : ""}`
      : state === "stale"
        ? `stale${status.ageMinutes != null ? ` · ${ago(status.ageMinutes)}` : ""}`
        : "unavailable"
  return (
    <span
      title={[status.note, status.error].filter(Boolean).join(" — ")}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium", tone, className)}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="text-foreground/80">{label}</span>
      <span aria-hidden className="opacity-40">/</span>
      {text}
    </span>
  )
}

const LEVEL_TONE: Record<Level, string> = {
  Green: "border-safe/40 bg-safe/10 text-safe",
  Orange: "border-alert/50 bg-alert/15 text-alert",
  Red: "border-severe/50 bg-severe/15 text-severe",
}

export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]",
        LEVEL_TONE[level],
        className,
      )}
    >
      {level !== "Green" && <AlertTriangle className="h-3 w-3" aria-hidden />}
      {level}
    </span>
  )
}

export function SimulatedBadge({ children = "Simulated" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-sim/40 bg-sim/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-sim">
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone,
  children,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: string
  children?: ReactNode
}) {
  return (
    <div className="panel flex flex-col gap-1.5 p-5">
      <p className="eyebrow">{label}</p>
      <p className={cn("font-display text-[2.5rem] font-medium leading-none tabular-nums tracking-tight", tone)}>{value}</p>
      {sub && <p className="text-xs leading-snug text-muted-foreground">{sub}</p>}
      {children}
    </div>
  )
}

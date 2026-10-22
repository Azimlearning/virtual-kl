"use client"

import { useMemo, useState } from "react"
import { IncidentCard, type IncidentSummary } from "@/components/incident-card"
import { CATEGORY_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"

const SEVERITY_ORDER = ["all", "critical", "high", "moderate", "low"] as const

export function IncidentFeed({ incidents }: { incidents: IncidentSummary[] }) {
  const [severity, setSeverity] = useState<(typeof SEVERITY_ORDER)[number]>("all")
  const [category, setCategory] = useState<string>("all")

  const categories = useMemo(() => {
    const set = new Set(incidents.map((i) => i.category))
    return ["all", ...Array.from(set)]
  }, [incidents])

  const filtered = incidents.filter(
    (i) =>
      (severity === "all" || i.severityLabel === severity) &&
      (category === "all" || i.category === category),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-card p-1">
          {SEVERITY_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                severity === s
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "All categories" : (CATEGORY_LABELS[c] ?? c)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {incidents.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No incidents match the current filters.
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((i) => (
            <IncidentCard key={i.id} incident={i} />
          ))}
        </div>
      )}
    </div>
  )
}

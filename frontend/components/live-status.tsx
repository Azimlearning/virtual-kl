import { Radio } from "lucide-react"
import { RelativeTime } from "@/components/relative-time"

/**
 * Replaces the old "Refresh intelligence" button. Feeds are fetched by the
 * backend on its own schedule (USGS and GDACS every 5 minutes; news, GDELT,
 * weather and ACLED every 30), and alerts are sent right after, so there is
 * nothing for a person to press. This line just shows the system is alive.
 */
export function LiveStatus({ lastUpdate }: { lastUpdate: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-2 font-medium text-foreground">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--chart-1)] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--chart-1)]" />
        </span>
        <Radio className="h-3.5 w-3.5 text-primary" aria-hidden />
        Live monitoring
      </span>
      <span>Sources are checked automatically and alerts are sent as they arise.</span>
      <span>
        Last data received:{" "}
        {lastUpdate ? <RelativeTime date={lastUpdate} className="font-medium text-foreground" /> : "unknown"}
      </span>
    </div>
  )
}

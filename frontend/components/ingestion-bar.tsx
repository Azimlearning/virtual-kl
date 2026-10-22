"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { triggerIngestion } from "@/app/actions/crisis"
import { relativeTime } from "@/lib/format"
import { RefreshCw, Satellite } from "lucide-react"
import { toast } from "sonner"

export function IngestionBar({
  lastRun,
}: {
  lastRun: { finishedAt: Date | string | null; signalsCollected: number | null; status: string } | null
}) {
  const [isPending, startTransition] = useTransition()
  const [running, setRunning] = useState(false)
  const router = useRouter()

  function refresh() {
    setRunning(true)
    toast.info("Scanning live sources…", {
      description: "Querying ReliefWeb, news wires, and weather alerts.",
    })
    startTransition(async () => {
      try {
        const res = await triggerIngestion()
        toast.success("Intelligence refreshed", {
          description: `${res.signalsCollected} signals · ${res.incidentsCreated} new · ${res.incidentsUpdated} updated`,
        })
        router.refresh()
      } catch (err) {
        toast.error("Ingestion failed", { description: (err as Error).message })
      } finally {
        setRunning(false)
      }
    })
  }

  const busy = running || isPending

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Satellite className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-medium">Live signal ingestion</p>
          <p className="text-xs text-muted-foreground">
            {lastRun?.finishedAt
              ? `Last sync ${relativeTime(lastRun.finishedAt)} · ${lastRun.signalsCollected ?? 0} signals`
              : "No sync yet — run the first scan"}
          </p>
        </div>
      </div>
      <Button onClick={refresh} disabled={busy} className="gap-2">
        <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {busy ? "Synthesizing…" : "Refresh intelligence"}
      </Button>
    </div>
  )
}

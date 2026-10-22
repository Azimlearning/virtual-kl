"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { validateIncident, setIncidentSeverity } from "@/app/actions/crisis"
import { Check, X, Gauge } from "lucide-react"
import { toast } from "sonner"

export function ValidationPanel({
  id,
  severity,
  validated,
  status,
}: {
  id: string
  severity: number
  validated: boolean
  status: string
}) {
  const [isPending, startTransition] = useTransition()
  const [score, setScore] = useState(severity)
  const router = useRouter()

  function decide(decision: "confirm" | "dismiss") {
    startTransition(async () => {
      try {
        await validateIncident(id, decision)
        toast.success(decision === "confirm" ? "Incident confirmed" : "Incident dismissed")
        router.refresh()
      } catch (err) {
        toast.error("Could not save decision", { description: (err as Error).message })
      }
    })
  }

  function applySeverity() {
    startTransition(async () => {
      try {
        await setIncidentSeverity(id, score)
        toast.success(`Severity overridden to ${score}`)
        router.refresh()
      } catch (err) {
        toast.error("Could not save severity", { description: (err as Error).message })
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Gauge className="h-4 w-4 text-primary" />
          Severity override
        </p>
        <input
          type="range"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Analyst score</span>
          <span className="font-mono text-base font-semibold text-foreground">{score}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2 w-full"
          disabled={isPending || score === severity}
          onClick={applySeverity}
        >
          Apply severity
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Human validation</p>
        <p className="text-xs text-muted-foreground">
          Confirm to mark this AI-generated assessment as analyst-verified, or dismiss false positives.
        </p>
        <div className="mt-1 flex gap-2">
          <Button
            size="sm"
            className="flex-1 gap-1.5 bg-[var(--chart-1)] text-[oklch(0.2_0.02_150)] hover:bg-[var(--chart-1)]/90"
            disabled={isPending || (validated && status === "active")}
            onClick={() => decide("confirm")}
          >
            <Check className="h-4 w-4" />
            {validated ? "Confirmed" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            disabled={isPending || status === "dismissed"}
            onClick={() => decide("dismiss")}
          >
            <X className="h-4 w-4" />
            {status === "dismissed" ? "Dismissed" : "Dismiss"}
          </Button>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { generateReport } from "@/app/actions/crisis"
import { FileText, Sparkles } from "lucide-react"
import { toast } from "sonner"

const TYPES = [
  { value: "situation", label: "Situation Report", desc: "Detailed SITREP for operations staff" },
  { value: "executive", label: "Executive Brief", desc: "High-level summary for decision-makers" },
  { value: "regional", label: "Regional Focus", desc: "Most affected areas in depth" },
] as const

export function ReportGenerator() {
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("situation")
  const [scope, setScope] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function generate() {
    startTransition(async () => {
      try {
        await generateReport({ reportType: type, scope: scope.trim() || undefined })
        toast.success("Report generated")
        router.refresh()
      } catch (err) {
        toast.error("Could not generate report", { description: (err as Error).message })
      }
    })
  }

  return (
    <Card className="gap-4 p-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        Generate report
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              type === t.value
                ? "border-primary/50 bg-primary/10"
                : "border-border hover:bg-accent/50"
            }`}
          >
            <p className="text-sm font-medium">{t.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="Optional scope (e.g. a region or category)"
          className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <Button onClick={generate} disabled={isPending} className="gap-2">
          <FileText className="h-4 w-4" />
          {isPending ? "Generating (can take a minute)…" : "Generate"}
        </Button>
      </div>
    </Card>
  )
}

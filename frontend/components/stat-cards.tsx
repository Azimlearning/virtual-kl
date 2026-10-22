import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Activity, AlertTriangle, CheckCircle2, Flame } from "lucide-react"

type Stats = {
  active: number
  critical: number
  high: number
  validated: number
}

export function StatCards({ stats }: { stats: Stats }) {
  const items = [
    {
      label: "Active Incidents",
      value: stats.active,
      icon: Activity,
      tone: "text-foreground",
      ring: "bg-primary/15 text-primary",
    },
    {
      label: "Critical",
      value: stats.critical,
      icon: Flame,
      tone: "text-[var(--chart-5)]",
      ring: "bg-[var(--chart-5)]/15 text-[var(--chart-5)]",
    },
    {
      label: "High Severity",
      value: stats.high,
      icon: AlertTriangle,
      tone: "text-[var(--chart-4)]",
      ring: "bg-[var(--chart-4)]/15 text-[var(--chart-4)]",
    },
    {
      label: "Analyst Validated",
      value: stats.validated,
      icon: CheckCircle2,
      tone: "text-[var(--chart-1)]",
      ring: "bg-[var(--chart-1)]/15 text-[var(--chart-1)]",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="flex items-center gap-3 p-4">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", it.ring)}>
            <it.icon className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className={cn("font-mono text-2xl font-semibold tabular-nums", it.tone)}>{it.value}</p>
            <p className="text-xs text-muted-foreground">{it.label}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}

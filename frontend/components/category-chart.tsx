"use client"

import { useMemo } from "react"
import { Cell, Pie, PieChart } from "recharts"
import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { CATEGORY_LABELS } from "@/lib/format"

// Distinct hues per category so the donut reads clearly in light and dark.
const CATEGORY_COLORS: Record<string, string> = {
  natural_disaster: "var(--chart-4)",
  armed_conflict: "var(--chart-5)",
  civil_unrest: "var(--chart-3)",
  disease_outbreak: "var(--chart-1)",
  humanitarian: "var(--chart-2)",
  severe_weather: "oklch(0.6 0.13 220)",
  infrastructure: "oklch(0.55 0.05 280)",
  other: "var(--muted-foreground)",
}

export function CategoryChart({ data }: { data: Record<string, number> }) {
  const { chartData, config, total } = useMemo(() => {
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
    const cfg: ChartConfig = {}
    const rows = entries.map(([key, value]) => {
      const color = CATEGORY_COLORS[key] ?? "var(--muted-foreground)"
      cfg[key] = { label: CATEGORY_LABELS[key] ?? key, color }
      return { name: key, label: CATEGORY_LABELS[key] ?? key, value, fill: color }
    })
    return {
      chartData: rows,
      config: cfg,
      total: entries.reduce((sum, [, v]) => sum + v, 0),
    }
  }, [data])

  return (
    <Card className="gap-3 p-4">
      <div>
        <p className="text-sm font-medium">By category</p>
        <p className="text-xs text-muted-foreground">Active incidents by type</p>
      </div>

      {chartData.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ChartContainer config={config} className="mx-auto aspect-square h-[200px] w-full">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="name" hideLabel />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              strokeWidth={2}
              stroke="var(--card)"
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      )}

      {chartData.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {chartData.map((row) => (
            <div key={row.name} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: row.fill }}
                aria-hidden
              />
              <span className="flex-1 truncate text-muted-foreground">{row.label}</span>
              <span className="font-mono tabular-nums">{row.value}</span>
              <span className="w-9 text-right font-mono text-muted-foreground tabular-nums">
                {total > 0 ? Math.round((row.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

"use client"

import { useMemo } from "react"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts"
import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const config: ChartConfig = {
  value: { label: "Incidents", color: "var(--chart-3)" },
}

export function RegionChart({ data }: { data: Record<string, number> }) {
  const chartData = useMemo(
    () =>
      Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([region, value]) => ({ region, value })),
    [data],
  )

  return (
    <Card className="gap-3 p-4">
      <div>
        <p className="text-sm font-medium">By region</p>
        <p className="text-xs text-muted-foreground">Top affected areas</p>
      </div>

      {chartData.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ChartContainer config={config} className="h-[220px] w-full">
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 4, right: 16 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <YAxis
              dataKey="region"
              type="category"
              tickLine={false}
              axisLine={false}
              width={96}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <XAxis type="number" hide />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  )
}

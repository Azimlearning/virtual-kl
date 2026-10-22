"use client"

import { useState } from "react"
import { KlMap } from "@/components/kl/kl-map-client"
import type { FloodStation, Station } from "@/lib/kl/types"

export function PulseMap({
  stations,
  floodStations,
  hazeIndex,
  jpsNote,
}: {
  stations: Station[]
  floodStations: FloodStation[]
  hazeIndex: number | null
  jpsNote?: string
}) {
  const [showStale, setShowStale] = useState(true)
  return (
    <div className="relative">
      <KlMap
        mode="pulse"
        stations={stations}
        floodStations={floodStations}
        showStale={showStale}
        hazeIndex={hazeIndex}
        autoRotate
        className="h-[420px] md:h-[600px]"
      />
      <div className="mt-3 flex flex-col gap-2 text-xs md:pointer-events-none md:absolute md:left-3 md:top-3 md:mt-0 md:max-w-[16rem]">
        <div className="pointer-events-auto rounded-xl border border-border bg-card/90 p-3.5 shadow-[var(--shadow-card)] backdrop-blur-md">
          <p className="eyebrow mb-2">Legend</p>
          <ul className="space-y-1 text-muted-foreground">
            <li className="flex items-center gap-2"><span className="inline-block h-3 w-1.5 rounded-sm bg-[rgb(240,130,50)]" />Column height = DOE API now</li>
            <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border-2 border-primary" />SDP development area</li>
            <li className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-zinc-400" />JPS flood station (stale)</li>
            <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-[rgba(150,125,90,.7)]" />Haze veil = city-wide model value</li>
          </ul>
          <label className="pointer-events-auto mt-2 flex cursor-pointer items-center gap-2 text-foreground">
            <input type="checkbox" checked={showStale} onChange={(e) => setShowStale(e.target.checked)} className="accent-primary" />
            Show stale JPS layer
          </label>
          {jpsNote && showStale && <p className="mt-1 text-[11px] leading-snug text-watch">{jpsNote}</p>}
        </div>
      </div>
    </div>
  )
}

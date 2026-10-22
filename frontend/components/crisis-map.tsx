"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Sphere,
  Marker,
  ZoomableGroup,
} from "react-simple-maps"
import { geoCentroid, geoArea } from "d3-geo"
import { Plus, Minus, Locate } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SEVERITY_META, CATEGORY_LABELS, type SeverityLabel } from "@/lib/format"

const MIN_ZOOM = 1
const MAX_ZOOM = 12
// Show state/province boundaries + labels once the user zooms past this level.
const STATE_ZOOM = 3.2
const DEFAULT_CENTER: [number, number] = [0, 20]

// Lightweight world topology (110m) served from a reliable CDN.
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
// Admin-1 (state/province) boundaries for the major countries. Loaded lazily on zoom.
const STATES_URL =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_1_states_provinces.geojson"

export type MapIncident = {
  id: string
  title: string
  category: string
  region: string
  severity: number
  severityLabel: SeverityLabel
  latitude: number | null
  longitude: number | null
}

const SEVERITY_FILL: Record<SeverityLabel, string> = {
  critical: "var(--chart-5)",
  high: "var(--chart-4)",
  moderate: "var(--chart-2)",
  low: "var(--chart-1)",
}

// Larger marker for more severe events so urgency reads at a glance.
function radiusFor(label: SeverityLabel): number {
  switch (label) {
    case "critical":
      return 7
    case "high":
      return 6
    case "moderate":
      return 5
    default:
      return 4
  }
}

export function CrisisMap({ incidents }: { incidents: MapIncident[] }) {
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState<MapIncident | null>(null)
  // "markers" = one dot per incident; "heat" = glowing density layer where
  // overlapping incidents build up intensity, weighted by severity.
  const [mode, setMode] = useState<"markers" | "heat">("markers")
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER)

  useEffect(() => {
    setMounted(true)
  }, [])

  const plotted = incidents.filter(
    (i) => typeof i.latitude === "number" && typeof i.longitude === "number",
  )

  const order: SeverityLabel[] = ["critical", "high", "moderate", "low"]

  const zoomIn = () => setZoom((z) => Math.min(z * 1.5, MAX_ZOOM))
  const zoomOut = () => setZoom((z) => Math.max(z / 1.5, MIN_ZOOM))
  const resetView = () => {
    setZoom(1)
    setCenter(DEFAULT_CENTER)
  }
  // Scale marker/label sizes down as the user zooms in so they stay proportional.
  const zoomScale = 1 / Math.sqrt(zoom)
  const showStates = zoom >= STATE_ZOOM

  // Larger countries get labeled first; more reveal as you zoom in.
  // geoArea returns steradians (whole sphere = 4π ≈ 12.57).
  const countryAreaThreshold = 0.045 / Math.pow(zoom, 1.4)

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Global event map</h2>
          <p className="text-xs text-muted-foreground">
            {plotted.length} geolocated incident{plotted.length === 1 ? "" : "s"} · color shows
            severity · zoom in for state names
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {order.map((label) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SEVERITY_FILL[label] }}
                aria-hidden
              />
              <span className="text-xs text-muted-foreground">{SEVERITY_META[label].label}</span>
            </div>
          ))}
          <div className="flex gap-1 rounded-md border border-border bg-card p-0.5" role="group" aria-label="Map layer">
            {(["markers", "heat"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                  mode === m ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "heat" ? "Heatmap" : "Markers"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative min-h-[460px] bg-[var(--secondary)]">
        {!mounted ? (
          <div className="flex h-[460px] w-full items-center justify-center text-xs text-muted-foreground">
            Loading map...
          </div>
        ) : (
          <>
            <ComposableMap
              projectionConfig={{ scale: 147 }}
              width={980}
              height={460}
              style={{ width: "100%", height: "auto" }}
              aria-label="World map of active crisis incidents"
            >
              <ZoomableGroup
                zoom={zoom}
                center={center}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                onMoveEnd={({ zoom: z, coordinates }) => {
                  setZoom(z)
                  setCenter(coordinates as [number, number])
                }}
              >
                {/* Ocean + graticule grid for spatial reference */}
                <Sphere
                  id="ocean"
                  fill="var(--secondary)"
                  stroke="var(--border)"
                  strokeWidth={0.5}
                />
                <Graticule stroke="var(--border)" strokeWidth={0.4} step={[20, 20]} />

                {/* Country fills + borders */}
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="var(--muted)"
                        stroke="var(--muted-foreground)"
                        strokeWidth={0.5 / zoom}
                        style={{
                          default: { outline: "none" },
                          hover: { outline: "none", fill: "var(--accent)" },
                          pressed: { outline: "none" },
                        }}
                      />
                    ))
                  }
                </Geographies>

                {/* State / province boundaries (major countries), revealed on zoom-in */}
                {showStates && (
                  <Geographies geography={STATES_URL}>
                    {({ geographies }) =>
                      geographies.map((geo) => (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill="transparent"
                          stroke="var(--muted-foreground)"
                          strokeWidth={0.4 / zoom}
                          strokeDasharray={`${1.5 / zoom} ${1.5 / zoom}`}
                          style={{
                            default: { outline: "none", opacity: 0.7 },
                            hover: { outline: "none", fill: "var(--accent)", opacity: 0.9 },
                            pressed: { outline: "none" },
                          }}
                        />
                      ))
                    }
                  </Geographies>
                )}

                {/* Country name labels (always on; density increases with zoom) */}
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies
                      .filter((geo) => geoArea(geo) >= countryAreaThreshold)
                      .map((geo) => {
                        const centroid = geoCentroid(geo)
                        const name = geo.properties?.name as string | undefined
                        if (!name || Number.isNaN(centroid[0])) return null
                        return (
                          <Marker key={`label-${geo.rsmKey}`} coordinates={centroid}>
                            <text
                              textAnchor="middle"
                              style={{
                                fontSize: `${10 * zoomScale}px`,
                                fontWeight: 600,
                                fill: "var(--foreground)",
                                paintOrder: "stroke",
                                stroke: "var(--card)",
                                strokeWidth: `${2.5 * zoomScale}px`,
                                strokeLinejoin: "round",
                                pointerEvents: "none",
                                letterSpacing: "0.02em",
                              }}
                            >
                              {name}
                            </text>
                          </Marker>
                        )
                      })
                  }
                </Geographies>

                {/* State / province name labels when zoomed in */}
                {showStates && (
                  <Geographies geography={STATES_URL}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const centroid = geoCentroid(geo)
                        const name = (geo.properties?.name ?? geo.properties?.name_en) as
                          | string
                          | undefined
                        if (!name || Number.isNaN(centroid[0])) return null
                        return (
                          <Marker key={`state-label-${geo.rsmKey}`} coordinates={centroid}>
                            <text
                              textAnchor="middle"
                              style={{
                                fontSize: `${7.5 * zoomScale}px`,
                                fontWeight: 500,
                                fill: "var(--muted-foreground)",
                                paintOrder: "stroke",
                                stroke: "var(--card)",
                                strokeWidth: `${2 * zoomScale}px`,
                                strokeLinejoin: "round",
                                pointerEvents: "none",
                              }}
                            >
                              {name}
                            </text>
                          </Marker>
                        )
                      })
                    }
                  </Geographies>
                )}

                {/* Heat layer: each incident is a soft radial glow. Where glows
                    overlap their opacity adds up, so dense clusters of events
                    show as hotter areas; bigger/more severe events glow wider. */}
                {mode === "heat" && (
                  <>
                    <defs>
                      <radialGradient id="cise-heat">
                        <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.55} />
                        <stop offset="45%" stopColor="var(--chart-4)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
                      </radialGradient>
                    </defs>
                    {plotted.map((incident) => {
                      const weight = Math.min(Math.max(incident.severity / 100, 0.15), 1)
                      return (
                        <Marker
                          key={`heat-${incident.id}`}
                          coordinates={[incident.longitude as number, incident.latitude as number]}
                        >
                          <circle
                            r={(12 + 26 * weight) * zoomScale}
                            fill="url(#cise-heat)"
                            style={{ pointerEvents: "none" }}
                          />
                        </Marker>
                      )
                    })}
                  </>
                )}

                {/* Incident markers (small clickable dots in heat mode) */}
                {plotted.map((incident) => {
                  const fill = SEVERITY_FILL[incident.severityLabel]
                  const r = (mode === "heat" ? 2 : radiusFor(incident.severityLabel)) * zoomScale
                  return (
                    <Marker
                      key={incident.id}
                      coordinates={[incident.longitude as number, incident.latitude as number]}
                      onMouseEnter={() => setHovered(incident)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <Link href={`/incidents/${incident.id}`}>
                        <circle
                          r={r}
                          fill={fill}
                          fillOpacity={0.9}
                          stroke="var(--background)"
                          strokeWidth={zoomScale}
                          className="cursor-pointer"
                        />
                        {mode === "markers" && incident.severityLabel === "critical" && (
                          <circle r={r} fill="none" stroke={fill} strokeWidth={1.5 * zoomScale} opacity={0.5}>
                            <animate
                              attributeName="r"
                              from={r}
                              to={r + 8 * zoomScale}
                              dur="1.6s"
                              repeatCount="indefinite"
                            />
                            <animate
                              attributeName="opacity"
                              from={0.5}
                              to={0}
                              dur="1.6s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}
                      </Link>
                    </Marker>
                  )
                })}
              </ZoomableGroup>
            </ComposableMap>

            {/* Zoom controls */}
            <div className="absolute right-3 top-3 flex flex-col gap-1">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 border border-border shadow-sm"
                onClick={zoomIn}
                disabled={zoom >= MAX_ZOOM}
                aria-label="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 border border-border shadow-sm"
                onClick={zoomOut}
                disabled={zoom <= MIN_ZOOM}
                aria-label="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 border border-border shadow-sm"
                onClick={resetView}
                aria-label="Reset view"
              >
                <Locate className="h-4 w-4" />
              </Button>
            </div>

            {/* Zoom hint */}
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-border bg-popover/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
              {showStates ? "States / provinces" : `Zoom in for state names · ${zoom.toFixed(1)}x`}
            </div>

            {hovered && (
              <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-md border border-border bg-popover/95 p-3 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: SEVERITY_FILL[hovered.severityLabel] }}
                    aria-hidden
                  />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {SEVERITY_META[hovered.severityLabel].label} · {hovered.severity}/100
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-popover-foreground text-pretty">
                  {hovered.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {CATEGORY_LABELS[hovered.category] ?? hovered.category} · {hovered.region}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
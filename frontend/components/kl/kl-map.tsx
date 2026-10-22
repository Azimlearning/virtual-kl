"use client"

import { useEffect, useRef, useState } from "react"
import * as maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { MapboxOverlay } from "@deck.gl/mapbox"
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers"
import { FOCUS_AREAS, KL_MAP_VIEW, MAP_ATTRIBUTION, MAP_STYLE_QUIET_URL, MAP_STYLE_URL } from "@/lib/kl/geo"
import { cssColor, indexColor } from "@/lib/kl/scoring"
import type { FloodStation, FocusArea, Station } from "@/lib/kl/types"

export type MapResident = { id: number; lon: number; lat: number; label: string }

export type KlMapProps = {
  mode: "pulse" | "twin"
  stations: Station[]
  floodStations?: FloodStation[]
  showStale?: boolean
  focus?: FocusArea
  residents?: MapResident[]
  /** Flat lon,lat pairs (same order as `residents`); animates between hours. Falls back to home positions. */
  residentPositions?: Float64Array
  /** Flat RGBA (4 bytes per resident, same order as `residents`). */
  residentColors?: Uint8Array
  colorsVersion?: number
  selectedResidentId?: number | null
  onPickResident?: (id: number) => void
  /** Index value (DOE-style) that drives the haze veil; null = clear. */
  hazeIndex?: number | null
  /** Slow city flyover until the user touches the map. */
  autoRotate?: boolean
  className?: string
}

const SDP = FOCUS_AREAS.filter((f) => f.kind === "sdp")

// MapLibre 6's worker is a separate ES module that bundlers don't emit; scripts/copy-maplibre-worker.mjs
// copies it to public/ before dev/build.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")

function pill(text: string, tone: "sdp" | "station"): HTMLElement {
  const el = document.createElement("div")
  el.textContent = text
  el.style.cssText = [
    "font: 600 11px/1 var(--font-instrument, system-ui)",
    "padding: 4px 8px",
    "border-radius: 999px",
    "white-space: nowrap",
    "pointer-events: none",
    "backdrop-filter: blur(4px)",
    tone === "sdp"
      ? "background: rgba(14,86,92,.96); color:#f6f3ea; box-shadow:0 0 0 2px rgba(246,243,234,.9), 0 4px 12px rgba(10,40,44,.35)"
      : "background: rgba(246,243,234,.94); color:#10302f; box-shadow:0 0 0 1px rgba(16,48,47,.28), 0 4px 12px rgba(10,40,44,.22)",
  ].join(";")
  return el
}

export function KlMapView(props: KlMapProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const propsRef = useRef(props)
  propsRef.current = props
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  // Create the map once.
  useEffect(() => {
    if (!container.current) return
    const p = propsRef.current
    const start =
      p.mode === "twin" && p.focus
        ? { lat: p.focus.lat, lon: p.focus.lon, zoom: 14.3, pitch: 60, bearing: -20 }
        : KL_MAP_VIEW
    const map = new maplibregl.Map({
      container: container.current,
      style: p.mode === "pulse" ? MAP_STYLE_QUIET_URL : MAP_STYLE_URL,
      center: [start.lon, start.lat],
      zoom: start.zoom,
      pitch: start.pitch,
      bearing: start.bearing,
      attributionControl: { compact: true, customAttribution: MAP_ATTRIBUTION },
      canvasContextAttributes: { antialias: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right")
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] })
    map.addControl(overlay as unknown as maplibregl.IControl)
    map.on("load", () => setStatus("ready"))
    let raf = 0
    let rotating = Boolean(p.autoRotate)
    const spin = () => {
      if (!rotating) return
      map.setBearing(map.getBearing() + 0.025)
      raf = requestAnimationFrame(spin)
    }
    const stop = () => {
      rotating = false
      cancelAnimationFrame(raf)
    }
    if (rotating) raf = requestAnimationFrame(spin)
    for (const ev of ["mousedown", "touchstart", "wheel"] as const) map.on(ev, stop)
    map.on("error", (e: { error?: { message?: string } }) => {
      // Tile hiccups are common and harmless; only flag a failed style.
      if (String(e?.error?.message ?? "").includes("style")) setStatus("error")
    })
    mapRef.current = map
    overlayRef.current = overlay
    return () => {
      rotating = false
      cancelAnimationFrame(raf)
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  // Fly to the focus area in the twin.
  useEffect(() => {
    const map = mapRef.current
    if (!map || props.mode !== "twin" || !props.focus) return
    map.flyTo({ center: [props.focus.lon, props.focus.lat], zoom: 14.3, pitch: 60, bearing: -20, duration: 2200, essential: true })
  }, [props.focus, props.mode])

  // HTML labels (focus areas / stations).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    if (props.mode === "pulse") {
      for (const f of SDP) {
        markersRef.current.push(
          new maplibregl.Marker({ element: pill(`SDP · ${f.name}`, "sdp"), anchor: "bottom", offset: [0, -6] })
            .setLngLat([f.lon, f.lat])
            .addTo(map),
        )
      }
    } else if (props.focus) {
      markersRef.current.push(
        new maplibregl.Marker({ element: pill(props.focus.name, props.focus.kind === "sdp" ? "sdp" : "station"), anchor: "bottom", offset: [0, -10] })
          .setLngLat([props.focus.lon, props.focus.lat])
          .addTo(map),
      )
    }
    for (const s of props.stations) {
      const el = pill(`${s.name} · API ${s.api ?? "n/a"}`, "station")
      el.style.borderLeft = `4px solid ${cssColor(s.api)}`
      markersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: "top", offset: [0, 8] }).setLngLat([s.lon, s.lat]).addTo(map),
      )
    }
  }, [props.mode, props.focus, props.stations])

  // deck.gl layers.
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const layers = []

    layers.push(
      new ScatterplotLayer<FocusArea>({
        id: "focus-areas",
        data: props.mode === "pulse" ? FOCUS_AREAS : props.focus ? [props.focus] : [],
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => d.radiusM,
        radiusUnits: "meters",
        stroked: true,
        filled: true,
        getFillColor: (d) => (d.kind === "sdp" ? [14, 130, 138, props.mode === "twin" ? 30 : 56] : [120, 150, 200, 25]),
        getLineColor: (d) => (d.kind === "sdp" ? [14, 130, 138, 235] : [150, 175, 215, 160]),
        lineWidthMinPixels: 2,
        pickable: false,
      }),
    )

    layers.push(
      new ColumnLayer<Station>({
        id: "doe-stations",
        data: props.stations,
        getPosition: (d) => [d.lon, d.lat],
        getElevation: (d) => (d.api ?? 0) * (props.mode === "pulse" ? 14 : 5),
        getFillColor: (d) => indexColor(d.api),
        radius: props.mode === "pulse" ? 420 : 90,
        diskResolution: 28,
        extruded: true,
        pickable: true,
        material: { ambient: 0.6, diffuse: 0.6, shininess: 24 },
      }),
    )

    if (props.showStale && props.floodStations?.length) {
      layers.push(
        new ScatterplotLayer<FloodStation>({
          id: "jps-stale",
          data: props.floodStations,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 4,
          radiusMinPixels: 3,
          radiusMaxPixels: 6,
          getFillColor: [140, 146, 158, 150],
          getLineColor: [200, 204, 212, 200],
          stroked: true,
          lineWidthMinPixels: 1,
          pickable: true,
        }),
      )
    }

    if (props.residents?.length && props.residentColors) {
      const colors = props.residentColors
      layers.push(
        new ScatterplotLayer<MapResident>({
          id: "residents",
          data: props.residents,
          getPosition: (d, { index }) =>
            props.residentPositions ? [props.residentPositions[index * 2], props.residentPositions[index * 2 + 1]] : [d.lon, d.lat],
          transitions: { getPosition: { duration: 340 } },
          getRadius: 5,
          radiusUnits: "meters",
          radiusMinPixels: 2.2,
          radiusMaxPixels: 7,
          getFillColor: (_d, { index }) => [colors[index * 4], colors[index * 4 + 1], colors[index * 4 + 2], colors[index * 4 + 3]],
          getLineColor: [255, 255, 255, 220],
          getLineWidth: (d) => (d.id === props.selectedResidentId ? 2 : 0),
          lineWidthUnits: "pixels",
          stroked: true,
          pickable: true,
          updateTriggers: {
            getFillColor: [props.colorsVersion ?? 0],
            getPosition: [props.colorsVersion ?? 0],
            getLineWidth: [props.selectedResidentId ?? -1],
          },
          onClick: (info) => {
            const o = info.object as MapResident | undefined
            if (o) propsRef.current.onPickResident?.(o.id)
          },
        }),
      )
    }

    overlay.setProps({
      layers,
      pickingRadius: 10,
      getTooltip: ({ object, layer }: { object?: unknown; layer?: { id: string } | null }) => {
        if (!object || !layer) return null
        const base = { className: "kl-tooltip" }
        if (layer.id === "doe-stations") {
          const s = object as Station
          return { ...base, text: `DOE ${s.name}\nAPI ${s.api ?? "n/a"} · ${s.category}\nobserved ${s.observedAt.slice(11, 16)}` }
        }
        if (layer.id === "jps-stale") {
          const s = object as FloodStation
          return { ...base, text: `JPS ${s.name}\nSTALE — last update ${s.updatedAt?.slice(0, 10) ?? "unknown"}` }
        }
        if (layer.id === "residents") return { ...base, text: `${(object as MapResident).label}\n(simulated resident)` }
        return null
      },
    })
  }, [
    status,
    props.mode,
    props.stations,
    props.floodStations,
    props.showStale,
    props.focus,
    props.residents,
    props.residentColors,
    props.residentPositions,
    props.colorsVersion,
    props.selectedResidentId,
  ])

  const haze = props.hazeIndex == null ? 0 : Math.min(0.62, Math.max(0, (props.hazeIndex - 40) / 320))

  return (
    <div className={`panel relative overflow-hidden ${props.className ?? "h-[520px]"}`}>
      {/* Inline style on purpose: maplibre-gl.css sets position:relative on its container, which would beat a utility class. */}
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      {/* Haze veil: opacity follows the index. City-wide model value, not a spatial plume (see /about). */}
      <div
        aria-hidden
        className="haze-veil pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: haze,
          background:
            "radial-gradient(120% 90% at 30% 20%, rgba(190,160,110,.95), rgba(150,125,90,.9) 55%, rgba(110,95,80,.95))",
        }}
      />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-background/40 text-sm text-muted-foreground backdrop-blur-sm">
          Loading 3D map…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-background/80 p-6 text-center text-sm text-muted-foreground">
          The map style could not be loaded (OpenFreeMap). Readings below are unaffected.
        </div>
      )}
    </div>
  )
}

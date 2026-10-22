import type { FocusArea } from "./types"

/**
 * Kuala Lumpur (the Federal Territory) is the whole scope (D-04).
 * Coordinates are sourced (A-03): OSM via Nominatim on 2026-10-22, or DOE's own station
 * coordinates. Anything approximate says so. Nothing here is invented.
 */

/** City-centre point used for model queries (approximate). */
export const KL_CENTER = { lat: 3.139, lon: 101.6869 }

export const KL_MAP_VIEW = { lat: 3.158, lon: 101.7, zoom: 11.1, pitch: 58, bearing: -12 }

export const FOCUS_AREAS: FocusArea[] = [
  {
    id: "kl-east",
    name: "KL East",
    kind: "sdp",
    lat: 3.224784,
    lon: 101.7306315,
    radiusM: 1400,
    source: "OSM way 760489378 (KL East Mall), Nominatim 2026-10-22",
    blurb: "SDP integrated development: KL East Mall, residences and KL East Park (Setiawangsa–Wangsa Maju side).",
  },
  {
    id: "melawati",
    name: "Melawati",
    kind: "sdp",
    lat: 3.219697,
    lon: 101.7378728,
    radiusM: 1500,
    source: "OSM node 3234269698 (Desa Melawati), Nominatim 2026-10-22 — approximate for SDP's Melawati township (A-01)",
    blurb: "SDP township area. Briefing deck lists it under Kuala Lumpur; SDP's annual report lists Ampang Jaya (A-01).",
  },
  {
    id: "klgcc",
    name: "KLGCC Resort",
    kind: "sdp",
    lat: 3.1400193,
    lon: 101.6397257,
    radiusM: 1500,
    source: "OSM relation 9519926 (Kuala Lumpur Golf & Country Club), Nominatim 2026-10-22",
    blurb: "SDP signature development at Bukit Kiara: golf resort, residences, KLGCC Mall.",
  },
  {
    id: "batu-muda",
    name: "Batu Muda",
    kind: "station",
    lat: 3.212429,
    lon: 101.682218,
    radiusM: 1500,
    source: "DOE APIMS station CA15W coordinates (via Haze Monitor)",
    blurb: "DOE air-quality station in north KL (Kepong–Segambut side). Highest reading in KL at time of writing.",
  },
  {
    id: "cheras",
    name: "Cheras",
    kind: "station",
    lat: 3.10626,
    lon: 101.717931,
    radiusM: 1500,
    source: "DOE APIMS station CA16W coordinates (via Haze Monitor)",
    blurb: "DOE air-quality station in south-east KL.",
  },
  {
    id: "klcc",
    name: "KLCC / city centre",
    kind: "city",
    lat: 3.1579,
    lon: 101.7116,
    radiusM: 1300,
    source: "Approximate public coordinate for KLCC — verify on OSM (A-03)",
    blurb: "Dense city-centre area: offices, malls and high-rise residences.",
  },
]

export function focusById(id: string): FocusArea {
  return FOCUS_AREAS.find((f) => f.id === id) ?? FOCUS_AREAS[0]
}

export const SDP_AREAS = FOCUS_AREAS.filter((f) => f.kind === "sdp")

/** OpenFreeMap vector style with 3D buildings (free, no key). Attribution is required. */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"
/** Quiet greyscale basemap for the Pulse view, so the data layers carry the colour. */
export const MAP_STYLE_QUIET_URL = "https://tiles.openfreemap.org/styles/positron"
export const MAP_ATTRIBUTION = "© OpenFreeMap © OpenMapTiles Data from OpenStreetMap"

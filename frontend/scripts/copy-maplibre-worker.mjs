// MapLibre GL 6 loads its tile worker from a separate ES-module file, which bundlers don't
// emit by themselves. Copy the worker (and the shared chunk it imports) into public/ so
// components/kl/kl-map.tsx can point maplibregl.setWorkerUrl() at it. Runs before dev/build.
import { copyFileSync, mkdirSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const from = path.join(root, "node_modules", "maplibre-gl", "dist")
const to = path.join(root, "public", "maplibre")
mkdirSync(to, { recursive: true })
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(from, f), path.join(to, f))
}
console.log("maplibre worker copied to public/maplibre")

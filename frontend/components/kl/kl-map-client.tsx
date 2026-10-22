"use client"

import dynamic from "next/dynamic"

/** maplibre-gl and deck.gl touch `window`, so the map is client-only. */
export const KlMap = dynamic(() => import("./kl-map").then((m) => m.KlMapView), {
  ssr: false,
  loading: () => (
    <div className="grid h-[520px] place-items-center rounded-xl bg-card text-sm text-muted-foreground ring-1 ring-foreground/10">
      Loading 3D map…
    </div>
  ),
})

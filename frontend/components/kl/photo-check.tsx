"use client"

import { useRef, useState } from "react"
import { Camera, Loader2, ScanSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FOCUS_AREAS } from "@/lib/kl/geo"
import type { PhotoCheckResult } from "@/lib/kl/types"
import { cn } from "@/lib/utils"

const VERDICT_STYLE = {
  corroborated: "border-safe/50 bg-safe/10 text-safe",
  contradicted: "border-severe/50 bg-severe/10 text-severe",
  unverified: "border-watch/50 bg-watch/10 text-watch",
} as const

/** Downscale in the browser so the upload stays small (JPEG, longest side 1280 px). */
async function toJpegBase64(file: File): Promise<{ base64: string; preview: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82)
  return { base64: dataUrl.split(",")[1] ?? "", preview: dataUrl }
}

export function PhotoCheck() {
  const input = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [focusId, setFocusId] = useState("klcc")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsKey, setNeedsKey] = useState(false)
  const [result, setResult] = useState<PhotoCheckResult | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setResult(null)
    setError(null)
    setNeedsKey(false)
    try {
      const { base64, preview } = await toJpegBase64(file)
      setBase64(base64)
      setPreview(preview)
    } catch {
      setError("Could not read that image. Try a JPEG or PNG.")
    }
  }

  async function submit() {
    if (!base64) return
    setLoading(true)
    setError(null)
    setNeedsKey(false)
    setResult(null)
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg", focusId }),
      })
      const data = await res.json()
      if (res.status === 503) {
        setNeedsKey(true)
        setError(data.error as string)
        return
      }
      if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status}`)
      setResult(data as PhotoCheckResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo check failed")
    } finally {
      setLoading(false)
    }
  }

  const obs = result?.observation
  const co = result?.corroboration

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="h-4 w-4" /> A resident&apos;s photo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <button
            onClick={() => input.current?.click()}
            className="grid min-h-56 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/40 text-sm text-muted-foreground hover:bg-muted"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Uploaded photo preview" className="max-h-80 w-full object-contain" />
            ) : (
              <span className="p-6 text-center">Click to choose a photo of the sky, skyline or street (JPEG/PNG).<br />It is resized in your browser before upload.</span>
            )}
          </button>
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Roughly where was it taken?
            <select value={focusId} onChange={(e) => setFocusId(e.target.value)} className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2 text-foreground">
              {FOCUS_AREAS.map((f) => (
                <option key={f.id} value={f.id} className="bg-card">{f.name}</option>
              ))}
            </select>
          </label>
          <Button onClick={() => void submit()} disabled={!base64 || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            Check against sensors
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Photos are sent to the model for analysis and are not stored by this prototype. Don&apos;t upload images of people.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verdict</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!result && !error && <p className="text-muted-foreground">A model reads the photo; our code then compares that reading with the nearest live DOE station. With no live sensor to compare, the answer is &quot;unverified&quot;, never a guess.</p>}
          {error && (
            <p className={cn("rounded-lg border p-3 text-sm", needsKey ? VERDICT_STYLE.unverified : "border-severe/40 bg-severe/10 text-severe")}>{error}</p>
          )}
          {obs && co && (
            <>
              <div className={cn("rounded-xl border p-3", VERDICT_STYLE[co.verdict])}>
                <p className="text-xs font-semibold uppercase tracking-wide">Verdict</p>
                <p className="text-xl font-semibold capitalize">{co.verdict}</p>
                <ul className="mt-1 list-disc pl-4 text-[13px] leading-snug">
                  {co.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What the model saw in the photo</p>
                <p className="mt-1">
                  <strong className="capitalize">{obs.hazard}</strong> · visibility <strong>{obs.visibility.replace("-", " ")}</strong> · model confidence {Math.round(obs.confidence * 100)}%
                </p>
                <ul className="mt-1 list-disc pl-4 text-[13px] text-muted-foreground">
                  {obs.observations.map((o) => <li key={o}>{o}</li>)}
                </ul>
              </div>
              {co.nearestStation && (
                <div className="rounded-lg bg-muted/60 p-3 text-[13px]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nearest live sensor</p>
                  <p className="mt-1">
                    DOE <strong>{co.nearestStation.name}</strong> · API <strong>{co.nearestStation.api ?? "n/a"}</strong> ({co.nearestStation.category}) · {co.nearestStation.distanceKm} km from the chosen area · observed {co.nearestStation.observedAt.slice(11, 16)}
                  </p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Indicative: a model&apos;s reading of one photo, not a measurement.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

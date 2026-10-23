"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { TOUR_STOPS, type TourStop } from "@/lib/intro"

type Box = { top: number; left: number; width: number; height: number }

/** The visible element for a stop (a mobile and a desktop copy can share a name). */
function find(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** The target's box, kept in step with scroll and resize. Returns the same object until the numbers change. */
function useBox(el: HTMLElement | null): Box | null {
  const cache = useRef<Box | null>(null)
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("resize", notify)
    window.addEventListener("scroll", notify, true)
    const ro = new ResizeObserver(notify)
    ro.observe(document.body)
    return () => {
      window.removeEventListener("resize", notify)
      window.removeEventListener("scroll", notify, true)
      ro.disconnect()
    }
  }, [])
  const get = () => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const c = cache.current
    if (c && c.top === r.top && c.left === r.left && c.width === r.width && c.height === r.height) return c
    cache.current = { top: r.top, left: r.left, width: r.width, height: r.height }
    return cache.current
  }
  return useSyncExternalStore(subscribe, get, () => null)
}

const BUBBLE_W = 330
const BUBBLE_H = 190
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi))

export function Tour({ onDone }: { onDone: () => void }) {
  const [stops, setStops] = useState<TourStop[] | null>(null)
  const [index, setIndex] = useState(0)
  const next = useRef<HTMLButtonElement | null>(null)
  const bubble = useRef<HTMLDivElement | null>(null)

  // Only stops whose control is on screen right now.
  useEffect(() => {
    const present = TOUR_STOPS.filter((s) => find(s.target))
    if (present.length === 0) onDone()
    else setStops(present)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = stops?.[index] ?? null
  const el = stop ? find(stop.target) : null
  const box = useBox(el)

  useEffect(() => {
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
    next.current?.focus()
  }, [el, index])

  if (!stops || !stop || !box) return null
  const last = index === stops.length - 1

  const vw = window.innerWidth
  const vh = window.innerHeight
  let top: number
  let left = clamp(box.left, 16, vw - BUBBLE_W - 16)
  if (box.top + box.height + BUBBLE_H + 20 < vh) top = box.top + box.height + 14
  else if (box.top - BUBBLE_H - 14 > 16) top = box.top - BUBBLE_H - 14
  else {
    // a tall target: sit inside it, at the bottom
    top = clamp(Math.min(box.top + box.height, vh) - BUBBLE_H - 56, 16, vh - BUBBLE_H - 16)
    left = clamp(box.left + box.width / 2 - BUBBLE_W / 2, 16, vw - BUBBLE_W - 16)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") return onDone()
    if (e.key !== "Tab" || !bubble.current) return
    const items = Array.from(bubble.current.querySelectorAll<HTMLElement>("button:not([disabled])"))
    const first = items[0]
    const lastEl = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      lastEl.focus()
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-[100]" onKeyDown={onKey}>
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-2xl transition-all duration-200 motion-reduce:transition-none"
        style={{
          top: box.top - 6,
          left: box.left - 6,
          width: box.width + 12,
          height: box.height + 12,
          boxShadow: "0 0 0 3px var(--primary), 0 0 22px 6px color-mix(in oklch, var(--primary) 55%, transparent), 0 0 0 9999px rgba(4,24,30,0.7)",
        }}
      />
      <div
        ref={bubble}
        role="dialog"
        aria-modal="true"
        aria-label="Tour of Virtual KL"
        aria-describedby="tour-text"
        className="absolute flex flex-col gap-2 rounded-xl border border-border bg-background p-4 text-sm shadow-2xl"
        style={{ top, left, width: BUBBLE_W, maxWidth: "calc(100vw - 2rem)" }}
      >
        <p className="eyebrow">{index + 1} of {stops.length}</p>
        <p className="text-base font-semibold leading-snug">{stop.title}</p>
        <p id="tour-text" className="leading-relaxed text-muted-foreground">{stop.text}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <button onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground">
            Skip tour
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
              Back
            </Button>
            <Button ref={next} size="sm" onClick={() => (last ? onDone() : setIndex((i) => i + 1))}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

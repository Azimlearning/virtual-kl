"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { TOUR_STOPS } from "@/lib/intro"

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
const BUBBLE_H = 200
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi))
const GIVE_UP_AFTER = 40 // polls of 100 ms: about 4 s for a page to load before a stop is skipped

/**
 * Walks the whole app. Each stop names its page; when the next stop is elsewhere the tour navigates there itself
 * (it lives in the root layout, so it stays on screen across the route change) and waits for the target to appear.
 */
export function Tour({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const [index, setIndex] = useState(0)
  const [el, setEl] = useState<HTMLElement | null>(null)
  const next = useRef<HTMLButtonElement | null>(null)
  const bubble = useRef<HTMLDivElement | null>(null)
  const total = TOUR_STOPS.length
  const stop = TOUR_STOPS[index]

  const advance = useCallback(
    (by: 1 | -1) => {
      const to = index + by
      if (to >= total) onDone()
      else if (to >= 0) setIndex(to)
    },
    [index, total, onDone],
  )

  // Get to the stop's page, then wait for its target to exist.
  useEffect(() => {
    setEl(null)
    if (pathname !== stop.path) {
      router.push(stop.path)
      return
    }
    let tries = 0
    const id = setInterval(() => {
      const found = find(stop.target)
      if (found) {
        clearInterval(id)
        setEl(found)
      } else if (++tries > GIVE_UP_AFTER) {
        clearInterval(id)
        if (index + 1 >= total) onDone()
        else setIndex(index + 1)
      }
    }, 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pathname])

  const box = useBox(el)

  useEffect(() => {
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
    next.current?.focus()
  }, [el, index])

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

  // While a page is loading, keep the page dimmed with a small note instead of a hole.
  if (!el || !box) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-end bg-[rgba(4,24,30,0.7)] p-6" onKeyDown={onKey}>
        <div role="status" className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-xl">
          Taking you to the next page…
          <button onClick={onDone} className="ml-3 text-foreground underline">Skip tour</button>
        </div>
      </div>
    )
  }

  const last = index === total - 1
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
  // a target pinned to the bottom-right corner (the floating agent): put the bubble beside it, above
  if (box.left > vw * 0.6 && box.top > vh * 0.6) {
    top = clamp(box.top - BUBBLE_H - 14, 16, vh - BUBBLE_H - 16)
    left = clamp(box.left + box.width - BUBBLE_W, 16, vw - BUBBLE_W - 16)
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
        <p className="eyebrow">{index + 1} of {total}</p>
        <p className="text-base font-semibold leading-snug">{stop.title}</p>
        <p id="tour-text" className="leading-relaxed text-muted-foreground">{stop.text}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <button onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground">
            Skip tour
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => advance(-1)} disabled={index === 0}>
              Back
            </Button>
            <Button ref={next} size="sm" onClick={() => advance(1)}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

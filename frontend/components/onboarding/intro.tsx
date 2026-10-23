"use client"

import { useEffect, useRef, useState } from "react"
import { Bot, Boxes, Eye, Telescope, Send, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SLIDES } from "@/lib/intro"
import { cn } from "@/lib/utils"

/** The three pictures: small, animated, coloured from the design tokens so dark mode follows. */
function Picture({ index }: { index: number }) {
  if (index === 0) {
    const dots = [
      { x: 38, y: 112, c: "fill-muted-foreground" },
      { x: 62, y: 124, c: "fill-watch" },
      { x: 88, y: 108, c: "fill-watch" },
      { x: 118, y: 120, c: "fill-safe" },
      { x: 146, y: 106, c: "fill-safe" },
      { x: 176, y: 118, c: "fill-severe" },
      { x: 202, y: 110, c: "fill-severe" },
    ]
    return (
      <svg viewBox="0 0 240 150" className="w-full max-w-[17rem]" role="img" aria-label="Haze rising above the threshold while residents change colour">
        <line x1="14" y1="62" x2="226" y2="62" className="stroke-muted-foreground/50" strokeDasharray="4 4" />
        <text x="16" y="56" className="fill-muted-foreground text-[9px]">API 100</text>
        <path d="M14 96 C60 94 80 90 110 70 S160 14 196 28 S226 60 228 66" pathLength={1} fill="none" strokeWidth="3" strokeLinecap="round" className="intro-draw stroke-primary" />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="5" className={cn("intro-pop", d.c)} style={{ animationDelay: `${0.9 + i * 0.12}s` }} />
        ))}
      </svg>
    )
  }
  if (index === 1) {
    const rows = [
      { Icon: Eye, label: "Noticed the forecast will cross 100" },
      { Icon: Telescope, label: "Rehearsed 7 options on the twin" },
      { Icon: Send, label: "Drafted advisories, waiting for you" },
    ]
    return (
      <div className="flex w-full max-w-[17rem] flex-col gap-2.5">
        <div className="mx-auto mb-1 grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary ob-float">
          <Bot className="h-6 w-6" aria-hidden />
        </div>
        {rows.map(({ Icon, label }, i) => (
          <div key={label} className="intro-rise flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-xs" style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            {label}
          </div>
        ))}
      </div>
    )
  }
  const chips = [
    { Icon: Boxes, label: "Compare options" },
    { Icon: Users, label: "Site managers" },
    { Icon: Bot, label: "Interview a resident" },
  ]
  return (
    <div className="flex w-full max-w-[17rem] flex-wrap justify-center gap-2.5">
      {chips.map(({ Icon, label }, i) => (
        <span key={label} className="intro-pop inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium" style={{ animationDelay: `${0.2 + i * 0.3}s` }}>
          <Icon className="h-4 w-4 text-primary" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  )
}

export function Intro({ onTour, onSkip }: { onTour: () => void; onSkip: () => void }) {
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<"next" | "back">("next")
  const panel = useRef<HTMLDivElement | null>(null)
  const last = index === SLIDES.length - 1
  const slide = SLIDES[index]

  function go(to: number) {
    setDir(to > index ? "next" : "back")
    setIndex(to)
  }

  useEffect(() => {
    panel.current?.focus()
  }, [index])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onSkip()
      return
    }
    if (e.key !== "Tab" || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href]"))
    if (items.length === 0) return
    const first = items[0]
    const lastEl = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault()
      lastEl.focus()
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(4,24,30,0.7)] p-4 backdrop-blur-[2px]">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Virtual KL"
        tabIndex={-1}
        onKeyDown={onKey}
        className="grid w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl outline-none sm:grid-cols-[0.95fr_1.05fr]"
      >
        <div className="grid min-h-48 place-items-center bg-primary/10 p-6">
          <div key={index} className={cn("grid w-full place-items-center", dir === "next" ? "ob-in-next" : "ob-in-back")}>
            <Picture index={index} />
          </div>
        </div>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-1 gap-1.5" aria-hidden>
              {SLIDES.map((_, i) => (
                <span key={i} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-border")} />
              ))}
            </div>
            <button onClick={onSkip} className="text-xs text-muted-foreground hover:text-foreground">
              Skip
            </button>
          </div>
          <p className="eyebrow">Step {index + 1} of {SLIDES.length}</p>
          <div key={index} className={cn("flex min-h-[10.5rem] flex-1 flex-col gap-2", dir === "next" ? "ob-in-next" : "ob-in-back")}>
            <h2 className="min-h-[3.75em] text-2xl font-semibold leading-tight tracking-tight sm:min-h-[2.5em]">{slide.title}</h2>
            <p className="min-h-[4.5em] text-sm leading-relaxed text-muted-foreground">{slide.text}</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => go(index - 1)} disabled={index === 0}>
              Back
            </Button>
            {last ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onSkip}>
                  Skip the tour
                </Button>
                <Button size="sm" onClick={onTour}>
                  Take a quick tour
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => go(index + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  RANGE_OPTIONS,
  isDefaultRange,
  monthGrid,
  monthTitle,
  normalizeCustom,
  rangeLabel,
  rangeToSearch,
  shiftMonth,
  todayUtc,
  type RangeSelection,
} from "@/lib/range"

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

// A date-range picker in the style of a flight-booking calendar: click a
// start day, click an end day, apply. Presets sit beside it for the common
// cases. The chosen range lives in the URL (?range=7d or ?from=..&to=..), not
// in component state, so it survives refresh, works with the back button and
// can be shared as a link; applying it navigates and the server page then asks
// the backend for just that window.
export function RangeSelect({ value }: { value: RangeSelection }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const today = todayUtc()
  // Draft selection while the popover is open (nothing is applied until "Apply").
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }))

  function openPicker() {
    if (value.kind === "custom") {
      setFrom(value.from)
      setTo(value.to)
      setView(shiftMonth(Number(value.to.slice(0, 4)), Number(value.to.slice(5, 7)) - 1, -1))
    } else {
      setFrom(null)
      setTo(null)
      setView(shiftMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, -1))
    }
    setHover(null)
    setOpen(true)
  }

  // Close on Escape or a click outside the popover.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [open])

  function go(sel: RangeSelection) {
    setOpen(false)
    startTransition(() => router.push(`${pathname}${rangeToSearch(sel)}`))
  }

  function pickDay(day: string) {
    if (from === null || to !== null) {
      // Starting a new range.
      setFrom(day)
      setTo(null)
    } else if (day < from) {
      // Clicked an earlier day second: treat it as the start instead.
      setTo(from)
      setFrom(day)
    } else {
      setTo(day)
    }
  }

  function apply() {
    const sel = from ? normalizeCustom(from, to ?? from, today) : null
    if (sel) go(sel)
  }

  // The range to paint: committed (from..to) or, while choosing the end, a
  // preview from the start to whatever day the mouse is over.
  const paintFrom = from
  const paintTo = to ?? (from && hover ? hover : null)
  const lo = paintFrom && paintTo ? (paintFrom <= paintTo ? paintFrom : paintTo) : paintFrom
  const hi = paintFrom && paintTo ? (paintFrom <= paintTo ? paintTo : paintFrom) : paintFrom

  const months = useMemo(() => [view, shiftMonth(view.year, view.month, 1)], [view])
  const atCurrentMonth = shiftMonth(view.year, view.month, 1).year * 12 + shiftMonth(view.year, view.month, 1).month >=
    Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1

  const summary = !from
    ? "Choose a start day"
    : !to
      ? "Now choose an end day (or press Apply for just this day)"
      : rangeLabel({ kind: "custom", from, to })

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={isPending}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground",
          "hover:bg-accent disabled:opacity-60",
          !isDefaultRange(value) && "border-primary/50",
        )}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span>{rangeLabel(value)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute right-0 z-50 mt-2 w-[min(92vw,44rem)] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex flex-row flex-wrap gap-1.5 md:w-36 md:flex-col">
              {RANGE_OPTIONS.map((o) => {
                const active = value.kind === "preset" && value.value === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => go({ kind: "preset", value: o.value })}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent",
                      active && "bg-primary/15 font-semibold text-primary",
                    )}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>

            <div className="flex-1">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
                  className="rounded-md p-1.5 hover:bg-accent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="grid flex-1 grid-cols-1 text-center text-sm font-semibold md:grid-cols-2">
                  <span>{monthTitle(months[0].year, months[0].month)}</span>
                  <span className="hidden md:block">{monthTitle(months[1].year, months[1].month)}</span>
                </div>
                <button
                  type="button"
                  aria-label="Next month"
                  disabled={atCurrentMonth}
                  onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
                  className="rounded-md p-1.5 hover:bg-accent disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2" onMouseLeave={() => setHover(null)}>
                {months.map((m, idx) => (
                  <div key={`${m.year}-${m.month}`} className={cn(idx === 1 && "hidden md:block")}>
                    <div className="grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground">
                      {WEEKDAYS.map((d) => (
                        <span key={d} className="py-1">
                          {d}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {monthGrid(m.year, m.month).map((day, i) => {
                        if (!day) return <span key={`pad-${i}`} />
                        const future = day > today
                        const isEdge = day === lo || day === hi
                        const inside = lo && hi && day > lo && day < hi
                        return (
                          <button
                            key={day}
                            type="button"
                            disabled={future}
                            onClick={() => pickDay(day)}
                            onMouseEnter={() => setHover(day)}
                            aria-label={day}
                            aria-pressed={isEdge || !!inside}
                            className={cn(
                              "h-8 text-xs",
                              future ? "cursor-not-allowed text-muted-foreground/40" : "hover:bg-accent",
                              inside && "bg-primary/15",
                              isEdge && "rounded-md bg-primary font-semibold text-primary-foreground hover:bg-primary",
                              day === today && !isEdge && "font-bold underline underline-offset-4",
                            )}
                          >
                            {Number(day.slice(8))}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {summary} <span className="opacity-70">· days are UTC</span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => go({ kind: "preset", value: "all" })}>
                Clear
              </Button>
              <Button type="button" size="sm" disabled={!from} onClick={apply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Date-range selection shared by the server pages (which read the URL and ask
// the backend for that window) and the client picker component. No "use
// client" here: this file is plain data and pure functions so both sides can
// import it.
//
// A selection is either a PRESET ("last 7 days") or a CUSTOM range of whole
// calendar days. Custom days are plain "YYYY-MM-DD" strings in UTC, never
// Date objects, so the browser's time zone can't shift a day by one (the
// backend stores and compares everything in UTC).
//
// URL shapes:   (none)            -> all time
//               ?range=7d         -> preset
//               ?from=2026-09-01&to=2026-09-14  -> custom (both ends inclusive)

export const RANGE_OPTIONS = [
  { value: "24h", label: "Last 24 hours", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "all", label: "All time", days: undefined },
] as const

export type RangeValue = (typeof RANGE_OPTIONS)[number]["value"]

export type RangeSelection =
  | { kind: "preset"; value: RangeValue }
  | { kind: "custom"; from: string; to: string }

export const DEFAULT_RANGE: RangeSelection = { kind: "preset", value: "all" }

/** How far back a custom range may reach (matches the backend's ~10 year "all time"). */
export const MAX_LOOKBACK_DAYS = 3650

// --- day-string helpers (all UTC) -------------------------------------------

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

function dayToMs(day: string): number {
  const m = DAY_RE.exec(day)
  return Date.UTC(Number(m![1]), Number(m![2]) - 1, Number(m![3]))
}

/** True only for real calendar days: "2026-02-30" is rejected. */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== "string") return false
  const m = DAY_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === value
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function addDays(day: string, n: number): string {
  return new Date(dayToMs(day) + n * MS_PER_DAY).toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((dayToMs(b) - dayToMs(a)) / MS_PER_DAY)
}

/** A real, ordered, not-in-the-future, not-absurdly-old custom range - or null. */
export function normalizeCustom(from: unknown, to: unknown, today: string = todayUtc()): RangeSelection | null {
  if (!isValidDay(from)) return null
  const end = isValidDay(to) ? to : from
  let lo = from
  let hi = end
  if (lo > hi) [lo, hi] = [hi, lo] // typed/edited backwards: swap instead of erroring
  if (hi > today) hi = today // nothing has happened in the future yet
  if (lo > hi) return null // entirely in the future
  const oldest = addDays(today, -MAX_LOOKBACK_DAYS)
  if (lo < oldest) lo = oldest
  if (lo > hi) return null // entirely older than we keep
  return { kind: "custom", from: lo, to: hi }
}

// --- URL <-> selection --------------------------------------------------------

type Param = string | string[] | undefined
export type RangeParams = { range?: Param; from?: Param; to?: Param }

const first = (v: Param) => (Array.isArray(v) ? v[0] : v)

/** Anything unrecognised (typo, old bookmark, tampering) falls back to the
 *  default instead of erroring, so a bad URL can never break the page. */
export function parseRange(params: RangeParams, today: string = todayUtc()): RangeSelection {
  const custom = normalizeCustom(first(params.from), first(params.to), today)
  if (custom) return custom
  const preset = RANGE_OPTIONS.find((o) => o.value === first(params.range))
  return preset ? { kind: "preset", value: preset.value } : DEFAULT_RANGE
}

/** The query string (with leading "?", or "" for the default) for a selection. */
export function rangeToSearch(sel: RangeSelection): string {
  if (sel.kind === "custom") return `?from=${sel.from}&to=${sel.to}`
  return sel.value === "all" ? "" : `?range=${sel.value}`
}

export function isDefaultRange(sel: RangeSelection): boolean {
  return sel.kind === "preset" && sel.value === "all"
}

// --- selection -> backend query ------------------------------------------------

/** What the backend's date-window parameters look like. */
export type WindowQuery = { days?: number; since?: string; until?: string }

/** Presets send `days`; a custom range sends `since` (start of the first
 *  day, inclusive) and `until` (start of the day AFTER the last day,
 *  exclusive) - so "3 Sep to 3 Sep" means exactly that one calendar day. */
export function rangeToWindow(sel: RangeSelection): WindowQuery {
  if (sel.kind === "custom") {
    return { since: `${sel.from}T00:00:00Z`, until: `${addDays(sel.to, 1)}T00:00:00Z` }
  }
  const days = RANGE_OPTIONS.find((o) => o.value === sel.value)?.days
  return days === undefined ? {} : { days }
}

// --- labels -----------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function formatDay(day: string, withYear = true): string {
  const [y, m, d] = day.split("-").map(Number)
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`
}

export function rangeLabel(sel: RangeSelection): string {
  if (sel.kind === "preset") return RANGE_OPTIONS.find((o) => o.value === sel.value)?.label ?? "All time"
  if (sel.from === sel.to) return formatDay(sel.from)
  const sameYear = sel.from.slice(0, 4) === sel.to.slice(0, 4)
  return `${formatDay(sel.from, !sameYear)} – ${formatDay(sel.to)}`
}

// --- calendar grid --------------------------------------------------------------

export function monthTitle(year: number, month: number): string {
  return `${MONTHS_LONG[month]} ${year}`
}

/** Cells for one month, Monday-first: leading `null`s pad to the first
 *  weekday, then each day as "YYYY-MM-DD". `month` is 0-11. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const firstDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7 // Monday = 0
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= count; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
  }
  return cells
}

/** Move a (year, month) pair by `delta` months, handling year rollover. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + month + delta
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 }
}

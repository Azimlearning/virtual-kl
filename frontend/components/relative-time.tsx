"use client"

import { useEffect, useState } from "react"
import { relativeTime } from "@/lib/format"

/**
 * Renders a relative timestamp ("3m ago") without triggering hydration
 * mismatches. On the server and first client paint it renders a stable
 * ISO-derived label, then switches to the live relative value after mount
 * and keeps it fresh on an interval.
 */
export function RelativeTime({
  date,
  className,
}: {
  date: Date | string
  className?: string
}) {
  const iso = typeof date === "string" ? date : date.toISOString()
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const update = () => setLabel(relativeTime(iso))
    update()
    const interval = setInterval(update, 30_000)
    return () => clearInterval(interval)
  }, [iso])

  // Deterministic fallback (UTC HH:MM) until the client takes over.
  const fallback = new Date(iso).toISOString().slice(11, 16) + " UTC"

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label ?? fallback}
    </time>
  )
}

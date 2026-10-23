"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Bell, Bot, ChevronDown, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { audienceLabel } from "@/lib/kl/templates"
import type { Initiative, Tone } from "@/lib/kl/proactive"
import { cn } from "@/lib/utils"
import { useAgent } from "@/components/kl/agent-provider"

const TONE_DOT: Record<Tone, string> = {
  info: "bg-primary",
  safe: "bg-safe",
  watch: "bg-watch",
  alert: "bg-alert",
  severe: "bg-severe",
}

const KIND_LABEL: Record<Initiative["kind"], string> = {
  watch: "Noticed",
  anticipate: "Saw it coming",
  alert: "Alert",
  recovery: "Easing",
  rehearsal: "Rehearsed",
  draft: "Drafted",
  data: "Data",
}

const timeKL = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" })

/** Live status line: what the agent is doing right now and when it last looked. */
export function AgentStatusLine({ className }: { className?: string }) {
  const { status, lastCheck, checkNow } = useAgent()
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000)
    return () => clearInterval(t)
  }, [])
  const mins = lastCheck ? Math.floor((Date.now() - lastCheck.getTime()) / 60_000) : null
  return (
    <div className={cn("flex items-center justify-between gap-2 text-xs text-muted-foreground", className)}>
      <span className="flex items-center gap-2">
        <span aria-hidden className="relative flex h-2 w-2">
          <span className={cn("absolute inline-flex h-full w-full rounded-full bg-primary opacity-60", status !== "starting" && "animate-ping")} />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        {status === "starting" ? "Starting up…" : status === "thinking" ? "Checking Kuala Lumpur…" : `Watching Kuala Lumpur${mins != null ? ` · checked ${mins < 1 ? "just now" : `${mins} min ago`}` : ""}`}
      </span>
      <button onClick={checkNow} disabled={status === "thinking"} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted disabled:opacity-50" aria-label="Check now">
        {status === "thinking" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        check now
      </button>
    </div>
  )
}

function InitiativeCard({ item }: { item: Initiative }) {
  const { act } = useAgent()
  const [open, setOpen] = useState(false)
  const resolved = item.status !== "open"
  return (
    <li className={cn("rounded-xl border border-border bg-card p-3 text-sm", resolved && item.status === "dismissed" && "opacity-60")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[item.tone])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{KIND_LABEL[item.kind]}</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{timeKL(item.at)} KL</span>
            {item.needsYou && item.status === "open" ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">needs you</span>
            ) : (
              item.auto && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">done on its own</span>
            )}
          </div>
          <p className="mt-1 font-semibold leading-snug">{item.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{item.body}</p>

          {item.advisories && item.advisories.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
                {open ? "Hide" : "Show"} the drafts
              </button>
              {open && (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {item.advisories.map((a) => (
                    <li key={a.id} className="rounded-lg bg-muted/60 p-2 text-xs leading-snug">
                      <span className="font-semibold">{audienceLabel(a.audience).en}</span>
                      <span className="text-muted-foreground"> · {a.status.replace("-", " ")}</span>
                      <p className="mt-0.5">{a.en.headline}: {a.en.action}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {item.actions && item.status === "open" && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {item.actions.map((a, i) => (
                <Button key={a.id} size="sm" variant={i === 0 && item.needsYou ? "default" : "outline"} onClick={() => act(item.id, a)}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function AgentFeed({ limit, className }: { limit?: number; className?: string }) {
  const { feed, desktop, enableDesktop } = useAgent()
  const items = limit ? feed.slice(0, limit) : feed
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <AgentStatusLine />
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          I'm taking a first look at Kuala Lumpur. I'll tell you what I find, rehearse the options myself, and only ask you for decisions.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((i) => (
            <InitiativeCard key={i.id} item={i} />
          ))}
        </ul>
      )}
      {desktop === "default" && (
        <button onClick={enableDesktop} className="inline-flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted">
          <Bell className="h-3 w-3" /> Let me notify you on the desktop when this tab is in the background
        </button>
      )}
    </div>
  )
}

/** Floating agent, on every page except the home page (which embeds the feed). */
export function AgentDock() {
  const pathname = usePathname()
  const { unread, markRead, status } = useAgent()
  const [open, setOpen] = useState(false)
  if (pathname === "/" || pathname.startsWith("/engine")) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {open && (
        <div className="flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-background p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="h-4 w-4 text-primary" /> Proactive agent
            </p>
            <button onClick={() => setOpen(false)} className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">
              close
            </button>
          </div>
          <AgentFeed limit={8} />
        </div>
      )}
      <button
        onClick={() => {
          setOpen((o) => !o)
          markRead()
        }}
        className="flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium shadow-lg hover:bg-muted"
        aria-label="Open the proactive agent"
        data-tour="agent-dock"
      >
        <Bot className="h-4 w-4 text-primary" />
        Agent · {status === "thinking" ? "checking" : "watching"}
        {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">{unread}</span>}
      </button>
    </div>
  )
}

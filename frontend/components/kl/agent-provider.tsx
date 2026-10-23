"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { EMPTY_MEMORY, draftInitiative, observe, type Initiative, type InitiativeAction, type Memory } from "@/lib/kl/proactive"
import type { AgentRun, Level, Snapshot } from "@/lib/kl/types"

/**
 * The proactive agent's loop (D-28). It starts by itself when the app opens, checks Kuala Lumpur every
 * minute, rehearses and drafts without being asked, and files what it did in a feed. It only comes to the
 * human for decisions that are theirs. Runs while a tab is open; a production version would run as a
 * scheduled worker (the CISE engine already has workers).
 */

const TICK_MS = 60_000
const STORE = "vkl-agent-v1" // sessionStorage: every new session starts with the agent introducing itself
const MAX_FEED = 30

export type Proposal = { interventionId: string; focusId: string; nonce: number }
export type AgentStatus = "starting" | "watching" | "thinking"
export type DesktopAlerts = "unsupported" | "default" | "granted" | "denied"

type Ctx = {
  feed: Initiative[]
  unread: number
  status: AgentStatus
  lastCheck: Date | null
  proposal: Proposal | null
  desktop: DesktopAlerts
  markRead: () => void
  act: (initiativeId: string, action: InitiativeAction) => void
  enableDesktop: () => void
  checkNow: () => void
}

const AgentContext = createContext<Ctx | null>(null)

export function useAgent(): Ctx {
  const c = useContext(AgentContext)
  if (!c) throw new Error("useAgent must be used inside <AgentProvider>")
  return c
}

function load(): { memory: Memory; feed: Initiative[] } | null {
  try {
    const raw = sessionStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as { memory: Memory; feed: Initiative[] }) : null
  } catch {
    return null
  }
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  const [feed, setFeed] = useState<Initiative[]>([])
  const [readCount, setReadCount] = useState(0)
  const [status, setStatus] = useState<AgentStatus>("starting")
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [desktop, setDesktop] = useState<DesktopAlerts>("unsupported")
  const memRef = useRef<Memory | null>(null)
  const feedRef = useRef<Initiative[]>([])
  const busy = useRef(false)
  const lastTickAt = useRef(0)
  const desktopRef = useRef<DesktopAlerts>("unsupported")
  desktopRef.current = desktop

  const persist = useCallback((memory: Memory | null, items: Initiative[]) => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ memory: memory ?? EMPTY_MEMORY, feed: items.slice(0, MAX_FEED) }))
    } catch {
      /* storage can be unavailable; the agent still works */
    }
  }, [])

  const commit = useCallback(
    (next: Initiative[]) => {
      feedRef.current = next
      setFeed(next)
      persist(memRef.current, next)
    },
    [persist],
  )

  const push = useCallback(
    (items: Initiative[]) => {
      if (!items.length) return
      commit([...items.slice().reverse(), ...feedRef.current].slice(0, MAX_FEED))
      for (const it of items) {
        const notable = it.needsYou != null || it.kind === "alert" || it.kind === "anticipate" || it.kind === "data"
        // Stay quiet while the intro or tour is open; the feed still records it.
        const dialogOpen = typeof document !== "undefined" && document.querySelector('[role=dialog][aria-modal=true]') != null
        if (notable && !dialogOpen) {
          const fn = it.tone === "severe" ? toast.error : it.tone === "alert" || it.tone === "watch" ? toast.warning : toast.message
          fn(it.title, { description: it.body.length > 140 ? it.body.slice(0, 137) + "…" : it.body, duration: 9000 })
          if (typeof document !== "undefined" && document.hidden && desktopRef.current === "granted") {
            try {
              new Notification(`Virtual KL agent: ${it.title}`, { body: it.body })
            } catch {
              /* ignore */
            }
          }
        }
      }
    },
    [commit],
  )

  const draft = useCallback(
    async (level: Level) => {
      try {
        const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ focusId: "kl-east" }) })
        if (!res.ok) return
        const run = (await res.json()) as AgentRun
        if (run.advisories.length) push([draftInitiative(new Date(), level, run.advisories, run.llm === "claude")])
      } catch {
        /* the next level change will try again */
      }
    },
    [push],
  )

  const tick = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    lastTickAt.current = Date.now()
    setStatus("thinking")
    try {
      const res = await fetch("/api/kl/snapshot", { cache: "no-store" })
      if (!res.ok) throw new Error(`snapshot ${res.status}`)
      const snap = (await res.json()) as Snapshot
      const now = new Date()
      const obs = observe(memRef.current, snap, now, "kl-east")
      memRef.current = obs.memory
      push(obs.initiatives)
      persist(obs.memory, feedRef.current)
      setLastCheck(now)
      if (obs.wantsDraft) void draft(obs.level)
    } catch {
      /* offline or a hiccup: stay quiet and look again next minute */
    } finally {
      busy.current = false
      setStatus("watching")
    }
  }, [draft, persist, push])

  // Start on my own; keep going every minute while the tab is visible.
  useEffect(() => {
    const saved = load()
    if (saved) {
      memRef.current = saved.memory
      feedRef.current = saved.feed
      setFeed(saved.feed)
      setReadCount(saved.feed.length)
    }
    if (typeof Notification !== "undefined") setDesktop(Notification.permission as DesktopAlerts)
    const first = setTimeout(() => void tick(), saved ? 400 : 1500)
    const every = setInterval(() => {
      if (document.visibilityState === "visible") void tick()
    }, TICK_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastTickAt.current > TICK_MS) void tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      document.removeEventListener("visibilitychange", onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setItem = useCallback(
    (id: string, patch: (i: Initiative) => Initiative) => {
      commit(feedRef.current.map((i) => (i.id === id ? patch(i) : i)))
    },
    [commit],
  )

  const act = useCallback(
    (id: string, action: InitiativeAction) => {
      switch (action.type) {
        case "apply":
          setProposal({ interventionId: action.interventionId, focusId: action.focusId, nonce: Date.now() })
          setItem(id, (i) => ({ ...i, status: "done", needsYou: undefined, actions: undefined }))
          if (pathRef.current !== "/") router.push("/")
          break
        case "approve":
          setItem(id, (i) => ({
            ...i,
            status: "done",
            needsYou: undefined,
            actions: [{ id: "open", label: "Review", type: "open", href: "/agent" }],
            body: i.body.replace(/\d+ wait for your approval; nothing is sent without it\./, "Approved. Delivery isn't wired in this prototype, so nothing is actually sent."),
            advisories: i.advisories?.map((a) => (a.status === "pending-approval" ? { ...a, status: "approved" } : a)),
          }))
          break
        case "open":
          router.push(action.href)
          break
        case "dismiss":
          setItem(id, (i) => ({ ...i, status: "dismissed", needsYou: undefined, actions: undefined }))
          break
      }
    },
    [router, setItem],
  )

  const enableDesktop = useCallback(() => {
    if (typeof Notification === "undefined") return
    void Notification.requestPermission().then((p) => setDesktop(p as DesktopAlerts))
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      feed,
      unread: Math.max(0, feed.length - readCount),
      status,
      lastCheck,
      proposal,
      desktop,
      markRead: () => setReadCount(feed.length),
      act,
      enableDesktop,
      checkNow: () => void tick(),
    }),
    [feed, readCount, status, lastCheck, proposal, desktop, act, enableDesktop, tick],
  )

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

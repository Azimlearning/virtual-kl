"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, Eye, Gavel, Loader2, Play, Send, ShieldCheck, ShieldX, Sparkles, Telescope, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LevelBadge, SimulatedBadge } from "@/components/kl/ui"
import { FOCUS_AREAS } from "@/lib/kl/geo"
import { audienceLabel } from "@/lib/kl/templates"
import type { Advisory, AdvisoryStatus, AgentRun, AgentStepId } from "@/lib/kl/types"
import { cn } from "@/lib/utils"

const STEP_ICON: Record<AgentStepId, typeof Eye> = {
  watch: Eye,
  anticipate: Telescope,
  simulate: Sparkles,
  decide: Gavel,
  act: Send,
}

const STATUS_STYLE: Record<AdvisoryStatus, string> = {
  "auto-sent": "bg-safe/15 text-safe",
  "pending-approval": "bg-alert/15 text-alert",
  approved: "bg-safe/15 text-safe",
  dismissed: "bg-muted text-muted-foreground",
  blocked: "bg-severe/15 text-severe",
}

const STATUS_LABEL: Record<AdvisoryStatus, string> = {
  "auto-sent": "auto-sent (demo feed)",
  "pending-approval": "waiting for approval",
  approved: "approved — would send (delivery not wired in this prototype)",
  dismissed: "dismissed",
  blocked: "blocked by guardrails",
}

export function AgentConsole() {
  const [run, setRun] = useState<AgentRun | null>(null)
  const [advisories, setAdvisories] = useState<Advisory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [lang, setLang] = useState<"en" | "bm">("en")
  const [focusId, setFocusId] = useState("kl-east")
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const execute = useCallback(async () => {
    setLoading(true)
    setError(null)
    setRevealed(0)
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusId }),
      })
      if (!res.ok) throw new Error(`Agent request failed (HTTP ${res.status})`)
      const data = (await res.json()) as AgentRun
      setRun(data)
      setAdvisories(data.advisories)
      // Reveal the steps one by one so the loop is visible.
      let n = 0
      if (timer.current) clearInterval(timer.current)
      timer.current = setInterval(() => {
        n += 1
        setRevealed(n)
        if (n >= data.steps.length + 1 && timer.current) clearInterval(timer.current)
      }, 650)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent failed")
    } finally {
      setLoading(false)
    }
  }, [focusId])

  useEffect(() => {
    void execute()
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setStatus(id: string, status: AdvisoryStatus) {
    setAdvisories((list) => list.map((a) => (a.id === id ? { ...a, status } : a)))
  }

  const pending = advisories.filter((a) => a.status === "pending-approval").length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Rehearse on
          <select
            value={focusId}
            onChange={(e) => setFocusId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
          >
            {FOCUS_AREAS.map((f) => (
              <option key={f.id} value={f.id} className="bg-card">
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void execute()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {run ? "Run again" : "Run the agent"}
        </Button>
        {run && (
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
            text by {run.llm === "claude" ? "Claude" : "templates (no model key)"} · {new Date(run.generatedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })} KL
          </span>
        )}
      </div>

      {error && <p className="rounded-lg border border-severe/40 bg-severe/10 p-3 text-sm text-severe">{error}</p>}
      {run?.llmNote && <p className="rounded-lg border border-watch/40 bg-watch/10 p-3 text-sm text-watch">{run.llmNote}</p>}

      {run && (
        <ol className="grid gap-3 lg:grid-cols-5">
          {run.steps.map((s, i) => {
            const Icon = STEP_ICON[s.id]
            const shown = revealed > i
            return (
              <li
                key={s.id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10 transition-all duration-500",
                  shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  s.id === "decide" && shown && "ring-2 ring-primary/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Step {i + 1}</p>
                    <p className="text-sm font-semibold leading-tight">{s.title}</p>
                  </div>
                </div>
                <p className="text-xs font-medium leading-snug">{s.summary}</p>
                <ul className="flex flex-col gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
                  {s.details.map((d) => (
                    <li key={d} className="border-l-2 border-border pl-2">
                      {d}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      )}

      {run && revealed > run.steps.length - 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                Decision <LevelBadge level={run.decision.level} />
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {run.decision.autonomy === "auto-send" ? "Autonomy: may auto-send" : `Autonomy: needs human approval${pending ? ` · ${pending} waiting` : ""}`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{run.decision.rationale}</p>
            {run.decision.dataGap && (
              <p className="rounded-lg border border-alert/40 bg-alert/10 p-2.5 text-xs">
                Data gap: part of the air-quality picture is missing, so &ldquo;Green&rdquo; here does not mean &ldquo;safe&rdquo;.
              </p>
            )}

            <div className="rounded-lg bg-sim/10 p-3 text-xs leading-relaxed">
              <div className="mb-1.5 flex items-center gap-2">
                <SimulatedBadge />
                <span className="font-semibold">
                  Warning rehearsal on {run.simulation.focusArea} — {run.simulation.calibration} persona defaults
                </span>
              </div>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {run.simulation.scenarios.map((s) => (
                  <p key={s.label} className="flex justify-between gap-3">
                    <span>{s.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.meanExposureHours} h exposed · {s.actedBeforeEventPct}% acted early
                    </span>
                  </p>
                ))}
              </div>
            </div>

            {advisories.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Advisories ({advisories.length}) — approval queue</p>
                  <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                    {(["en", "bm"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setLang(l)}
                        className={cn("rounded-md px-2.5 py-1 font-medium", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                      >
                        {l === "en" ? "English" : "Bahasa Malaysia"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {advisories.map((a) => {
                    const m = a[lang]
                    const g = a.guardrails
                    return (
                      <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            To: {audienceLabel(a.audience)[lang]}
                          </p>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[a.status])}>
                            {STATUS_LABEL[a.status]}
                          </span>
                        </div>
                        <p className="text-sm font-semibold leading-snug">{m.headline}</p>
                        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-[13px] leading-snug">
                          <dt className="text-muted-foreground">What</dt><dd>{m.what}</dd>
                          <dt className="text-muted-foreground">Where</dt><dd>{m.where}</dd>
                          <dt className="text-muted-foreground">When</dt><dd>{m.when}</dd>
                          <dt className="font-medium text-primary">Do this</dt><dd className="font-medium">{m.action}</dd>
                        </dl>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {g.passed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-safe/15 px-2 py-0.5 text-safe">
                              <ShieldCheck className="h-3 w-3" /> guardrails passed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-severe/15 px-2 py-0.5 text-severe">
                              <ShieldX className="h-3 w-3" /> guardrails failed
                            </span>
                          )}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                            numbers {g.numbersGrounded ? "grounded" : `unknown: ${g.unknownNumbers.join(", ")}`}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                            level {g.levelOk ? "ok" : "overstated"}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">complete {g.complete ? "yes" : "no"}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">by {a.source}</span>
                        </div>
                        {g.claimIssues.length > 0 && <p className="text-[11px] text-severe">{g.claimIssues.join(" · ")}</p>}
                        {a.status === "pending-approval" && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => setStatus(a.id, "approved")}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "dismissed")}>
                              <X className="h-3.5 w-3.5" /> Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            {advisories.length === 0 && <p className="text-sm text-muted-foreground">Nothing to send — the agent&apos;s decision is to do nothing.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExportButtons } from "@/components/export-buttons"
import { relativeTime } from "@/lib/format"
import { FileText } from "lucide-react"

type Report = {
  id: number
  title: string
  reportType: string
  scope: string | null
  content: string
  aiIncluded?: boolean
  generatedBy: string
  createdAt: Date | string
}

export function ReportList({ reports }: { reports: Report[] }) {
  const [open, setOpen] = useState<Report | null>(null)

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No reports yet. Generate one above to brief your team.
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-3">
        {reports.map((r) => (
          <button key={r.id} onClick={() => setOpen(r)} className="text-left">
            <Card className="flex flex-row items-center gap-3 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {r.reportType} · {r.aiIncluded ? "AI-assisted" : "data only"} · {r.generatedBy} ·{" "}
                  {relativeTime(r.createdAt)}
                </p>
              </div>
            </Card>
          </button>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85svh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-pretty">{open?.title}</DialogTitle>
          </DialogHeader>
          {open && <ExportButtons title={open.title} markdown={open.content} />}
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h2 className="mt-2 text-lg font-semibold text-foreground">{children}</h2>
                ),
                h2: ({ children }) => (
                  <h3 className="mt-2 text-base font-semibold text-foreground">{children}</h3>
                ),
                h3: ({ children }) => (
                  <h4 className="mt-1 text-sm font-semibold text-foreground">{children}</h4>
                ),
                p: ({ children }) => <p className="leading-relaxed">{children}</p>,
                ul: ({ children }) => (
                  <ul className="ml-5 flex list-disc flex-col gap-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="ml-5 flex list-decimal flex-col gap-1">{children}</ol>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                // Source links open in a new tab so the report stays on screen.
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {open?.content ?? ""}
            </ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

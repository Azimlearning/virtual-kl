"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, ClipboardList, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RelativeTime } from "@/components/relative-time"
import { addIncidentNote, type IncidentNote } from "@/app/actions/crisis"

const NOTE_TYPES = [
  { value: "response_log", label: "Response log" },
  { value: "impact_record", label: "Impact record" },
  { value: "lesson_learned", label: "Lesson learned" },
] as const

const TYPE_LABEL: Record<string, string> = Object.fromEntries(NOTE_TYPES.map((t) => [t.value, t.label]))

const NOTE_MAX = 2000 // same limits the backend enforces
const FIELD_MAX = 200

const FIELD =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"

// Human-written records for one incident. Deliberately never AI-generated:
// a fabricated response log would misrepresent what actually happened. The
// infrastructure/organisation names are mirrored into the Neo4j knowledge
// graph on the next sync (see app/knowledge/sync.py).
export function IncidentNotes({ incidentId, notes }: { incidentId: string; notes: IncidentNote[] }) {
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number]["value"]>("response_log")
  const [content, setContent] = useState("")
  const [infrastructure, setInfrastructure] = useState("")
  const [organisation, setOrganisation] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    startTransition(async () => {
      try {
        await addIncidentNote(incidentId, {
          noteType,
          content,
          affectedInfrastructure: infrastructure,
          respondingOrganisation: organisation,
        })
        toast.success("Note saved")
        setContent("")
        setInfrastructure("")
        setOrganisation("")
        router.refresh()
      } catch (err) {
        toast.error("Could not save note", { description: (err as Error).message })
      }
    })
  }

  return (
    <Card className="gap-4 p-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <ClipboardList className="h-4 w-4 text-primary" />
          Response notes ({notes.length})
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Written by people, never by the AI. They form the incident&apos;s record of impact, response and lessons learned.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-card p-1">
          {NOTE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setNoteType(t.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                noteType === t.value
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          maxLength={NOTE_MAX}
          aria-describedby="note-counter"
          placeholder="What happened, what was done, or what should be remembered?"
          className={FIELD}
        />
        <p
          id="note-counter"
          className={`text-right text-xs ${content.length > NOTE_MAX * 0.9 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {content.length} / {NOTE_MAX}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={infrastructure}
            onChange={(e) => setInfrastructure(e.target.value)}
            maxLength={FIELD_MAX}
            placeholder="Affected infrastructure (optional)"
            className={FIELD}
          />
          <input
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            maxLength={FIELD_MAX}
            placeholder="Responding organisation (optional)"
            className={FIELD}
          />
        </div>
        <Button onClick={submit} disabled={isPending || !content.trim()} className="w-fit">
          {isPending ? "Saving…" : "Add note"}
        </Button>
      </div>

      {notes.length > 0 && (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-col gap-1.5 py-3 text-sm last:pb-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border px-2 py-0.5 font-medium text-foreground">
                  {TYPE_LABEL[n.noteType] ?? n.noteType}
                </span>
                <span>{n.createdBy}</span>
                <span>·</span>
                <RelativeTime date={n.createdAt} />
              </div>
              <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground/90">{n.content}</p>
              {(n.affectedInfrastructure || n.respondingOrganisation) && (
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {n.affectedInfrastructure && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" /> {n.affectedInfrastructure}
                    </span>
                  )}
                  {n.respondingOrganisation && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {n.respondingOrganisation}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

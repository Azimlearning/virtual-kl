import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { groundingBand, type Guardrails } from "@/lib/guardrails"

type Status = "good" | "warn" | "bad"

const TONE: Record<Status, { text: string; Icon: typeof CheckCircle2 }> = {
  good: { text: "text-[var(--chart-1)]", Icon: CheckCircle2 },
  warn: { text: "text-[var(--chart-4)]", Icon: AlertTriangle },
  bad: { text: "text-[var(--chart-5)]", Icon: XCircle },
}

// Plain-language version of the backend's technical guardrail metrics
// (grounding_score, numbers_grounded, domain_constraints_ok, schema_valid).
// The wording lives in lib/guardrails.ts so exports say the same thing.
export function GuardrailPanel({ g }: { g: Guardrails }) {
  const band = groundingBand(g.groundingPct)

  const rows: { status: Status; title: string; detail: string }[] = [
    {
      status: band === "strong" ? "good" : band === "partial" ? "warn" : "bad",
      title: "Wording matches the sources",
      detail: `${g.groundingPct}% of the AI's key words appear in the retrieved records (${band}).`,
    },
    {
      status: g.numbersVerified ? "good" : "bad",
      title: g.numbersVerified ? "Numbers verified" : "Numbers not verified",
      detail: g.numbersVerified
        ? "Every number in the AI text appears in the source records."
        : "The AI text contains a number that is not in the source records. Check before use.",
    },
    {
      status: g.levelsConsistent ? "good" : "bad",
      title: g.levelsConsistent ? "Alert levels consistent" : "Alert levels not consistent",
      detail: g.levelsConsistent
        ? "Any Red/Orange/Green level the AI mentions exists in the source records."
        : "The AI mentions an alert level that is not in the source records. Check before use.",
    },
    {
      status: g.formatValid ? "good" : "bad",
      title: g.formatValid ? "Answer format valid" : "Answer format invalid",
      detail: g.formatValid
        ? "The AI answered in the required structured format."
        : "The AI did not follow the required format, so its text could not be used.",
    },
  ]

  const needsReview = rows.some((r) => r.status === "bad")

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Fact-check of the AI summary</p>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            needsReview
              ? "border-[var(--chart-5)]/40 text-[var(--chart-5)]"
              : "border-[var(--chart-1)]/40 text-[var(--chart-1)]"
          }`}
        >
          {needsReview ? "Review needed" : "Checks passed"}
        </span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const { Icon, text } = TONE[r.status]
          return (
            <li key={r.title} className="flex gap-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${text}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{r.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        {g.alertWorthy
          ? "This brief passed every check and is based on at least one Orange or Red source, so it qualifies as alert-worthy. "
          : ""}
        These are automatic checks, not a guarantee of accuracy. An analyst should still review the summary.
      </p>
    </Card>
  )
}

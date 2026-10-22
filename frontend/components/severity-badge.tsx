import { cn } from "@/lib/utils"
import { SEVERITY_META, type SeverityLabel } from "@/lib/format"

export function SeverityBadge({
  label,
  score,
  className,
}: {
  label: SeverityLabel
  score?: number
  className?: string
}) {
  const meta = SEVERITY_META[label]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        meta.border,
        meta.bg,
        meta.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
      {typeof score === "number" && <span className="font-mono opacity-80">{score}</span>}
    </span>
  )
}

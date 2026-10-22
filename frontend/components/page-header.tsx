import type { ReactNode } from "react"

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: string
  actions?: ReactNode
  /** Small mono label above the title, e.g. the section name. */
  eyebrow?: string
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-2 pt-2">
      <div className="min-w-0">
        {eyebrow && (
          <p className="eyebrow mb-3 flex items-center gap-2.5 text-primary">
            <span aria-hidden className="h-px w-8 bg-primary/60" />
            {eyebrow}
          </p>
        )}
        <h1 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight md:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

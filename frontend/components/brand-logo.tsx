import { cn } from "@/lib/utils"

/**
 * The Virtual KL mark: two towers (the city) standing inside a ring (the haze / the watched
 * perimeter). Drawn inline so it follows the theme's primary colour. public/icon.svg is the same
 * mark for the browser tab.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("h-8 w-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <circle cx="16" cy="16" r="9.5" fill="none" strokeWidth="1.5" className="stroke-primary-foreground/55" />
      <rect x="11" y="9" width="4" height="15" rx="2" className="fill-primary-foreground" />
      <rect x="17" y="9" width="4" height="15" rx="2" className="fill-primary-foreground" />
      <rect x="14.5" y="16" width="3" height="1.6" className="fill-primary-foreground" />
    </svg>
  )
}

/** Mark + wordmark (+ optional descriptor). */
export function BrandLogo({ className, showTagline = true }: { className?: string; showTagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <div className="leading-none">
        <p className="font-display text-lg font-semibold tracking-tight">Virtual KL</p>
        {showTagline && <p className="eyebrow mt-1 !text-[0.625rem]">Township resilience</p>}
      </div>
    </div>
  )
}

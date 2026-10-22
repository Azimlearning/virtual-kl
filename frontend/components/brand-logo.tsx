import { cn } from "@/lib/utils"

/**
 * The CISE mark: an open ring (many incoming signals) converging on one dot
 * (the single synthesised picture). Drawn inline so it follows the theme's
 * primary colour in light and dark mode. public/icon.svg is the same mark
 * for the browser tab.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("h-8 w-8 shrink-0", className)}>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <path
        d="M23.2 11.2A9 9 0 1 0 23.2 20.8"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-[#1a1f29]"
      />
      <circle cx="16" cy="16" r="3" className="fill-[#1a1f29]" />
    </svg>
  )
}

/** Mark + wordmark + what the letters stand for. */
export function BrandLogo({ className, showTagline = true }: { className?: string; showTagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <div className="leading-tight">
        <p className="text-base font-bold tracking-wide">CISE</p>
        {showTagline && (
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Crisis Intelligence Synthesis Engine
          </p>
        )}
      </div>
    </div>
  )
}

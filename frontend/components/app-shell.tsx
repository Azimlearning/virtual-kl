"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  Camera,
  FileText,
  Info,
  LayoutDashboard,
  Radar,
  ShieldAlert,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { BrandLogo } from "@/components/brand-logo"

const KL_NAV = [
  { href: "/", label: "KL Twin", icon: Boxes },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/live", label: "Live data", icon: Radar },
  { href: "/check", label: "Photo check", icon: Camera },
  { href: "/about", label: "Methods & limits", icon: Info },
]

// The CISE engine pages need the FastAPI backend, so they only appear when it is wired up.
const ENGINE_ENABLED = process.env.NEXT_PUBLIC_ENGINE_ENABLED === "true"
const ENGINE_NAV = [
  { href: "/engine", label: "Engine overview", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: ShieldAlert },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/activity", label: "Activity log", icon: Activity },
]

type NavItem = { href: string; label: string; icon: typeof Radar }

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href))
}

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className={cn("h-4 w-4", active && "text-primary")} aria-hidden />
            {item.label}
            {active && <span aria-hidden className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-primary" />}
          </Link>
        )
      })}
    </>
  )
}

export function AppShell({
  children,
}: {
  children: ReactNode
  /** Kept for the CISE engine pages that still pass it. */
  userName?: string
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 md:px-6">
          <Link href="/" aria-label="Virtual KL home" className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandLogo showTagline={false} />
          </Link>

          <nav aria-label="Main" className="no-scrollbar hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex">
            <NavLinks items={KL_NAV} pathname={pathname} />
            {ENGINE_ENABLED && (
              <>
                <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-border" />
                <span className="eyebrow mr-1 shrink-0">CISE engine</span>
                <NavLinks items={ENGINE_NAV} pathname={pathname} />
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="eyebrow hidden items-center gap-2 lg:flex">
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-safe opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-safe" />
              </span>
              Live · Kuala Lumpur
            </span>
            <ThemeToggle />
          </div>
        </div>

        <nav aria-label="Main (mobile)" className="no-scrollbar flex gap-0.5 overflow-x-auto px-3 pb-2 md:hidden">
          <NavLinks items={ENGINE_ENABLED ? [...KL_NAV, ...ENGINE_NAV] : KL_NAV} pathname={pathname} />
        </nav>
      </header>

      <main className="flex-1 overflow-x-hidden">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 md:px-6">
          <p className="eyebrow">Prototype · Sime Darby Property University Hackathon 2026</p>
          <p className="eyebrow">People → Safety &amp; Security</p>
        </div>
      </footer>
    </div>
  )
}

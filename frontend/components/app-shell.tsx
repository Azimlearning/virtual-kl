"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { Activity, Bell, FileText, LayoutDashboard, ShieldAlert, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { BrandLogo, BrandMark } from "@/components/brand-logo"

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: ShieldAlert },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/activity", label: "Activity Log", icon: Activity },
]

export function AppShell({
  children,
  userName,
}: {
  children: ReactNode
  userName: string
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    // Auth is stripped for now (see lib/auth.ts) - nothing to actually
    // sign out of yet. Kept as a button for layout/future wiring.
    router.refresh()
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="border-b border-border px-4 py-4">
          <Link href="/" aria-label="CISE home">
            <BrandLogo />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">Operations Analyst</p>
          </div>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone/tablet: the sidebar is hidden, so a slim top bar keeps the brand and navigation reachable. */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <Link href="/" aria-label="CISE home" className="flex items-center gap-2">
              <BrandMark className="h-7 w-7" />
              <span className="text-sm font-bold tracking-wide">CISE</span>
            </Link>
            <ThemeToggle />
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Main">
            {NAV.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
                    active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </header>
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}

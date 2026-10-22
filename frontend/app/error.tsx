"use client"

import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">This page couldn&apos;t load</h1>
        <p className="text-muted-foreground">
          A data source or service this page depends on isn&apos;t responding. Nothing is lost; try again, or go back to the live picture of Kuala Lumpur.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Link href="/" className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
            KL Pulse
          </Link>
        </div>
      </div>
    </AppShell>
  )
}

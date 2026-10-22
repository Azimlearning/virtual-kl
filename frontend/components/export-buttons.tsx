"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

function fileSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "cise-export"
}

// Sends the markdown to our own /api/export route (which forwards it to the
// backend's PDF/DOCX builder) and saves the returned file in the browser.
export function ExportButtons({ title, markdown }: { title: string; markdown: string }) {
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null)

  async function download(format: "pdf" | "docx") {
    setBusy(format)
    try {
      const res = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, markdown }),
      })
      if (!res.ok) throw new Error(`The server returned ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${fileSlug(title)}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error("Could not export", { description: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => download("pdf")}>
        <Download className="h-4 w-4" />
        {busy === "pdf" ? "Preparing…" : "PDF"}
      </Button>
      <Button variant="secondary" size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => download("docx")}>
        <Download className="h-4 w-4" />
        {busy === "docx" ? "Preparing…" : "Word"}
      </Button>
    </div>
  )
}

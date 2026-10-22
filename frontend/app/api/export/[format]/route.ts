import { NextResponse } from "next/server"

// The browser can't call the Python backend directly (its address is a
// server-side setting, API_BASE_URL), so the export buttons POST here and
// this route forwards the request. It streams the PDF/DOCX straight back.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000"

export async function POST(req: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params
  if (format !== "pdf" && format !== "docx") {
    return NextResponse.json({ error: "Unsupported format" }, { status: 404 })
  }

  const upstream = await fetch(new URL(`/api/export/${format}`, API_BASE_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
    cache: "no-store",
  })
  if (!upstream.ok) {
    return NextResponse.json({ error: "Export failed" }, { status: upstream.status })
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? `attachment; filename="export.${format}"`,
    },
  })
}

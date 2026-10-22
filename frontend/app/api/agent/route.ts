import { runAgent } from "@/lib/kl/agent"
import { getSnapshot } from "@/lib/kl/snapshot"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: Request) {
  let focusId: string | undefined
  try {
    const body = (await req.json()) as { focusId?: string }
    focusId = typeof body.focusId === "string" ? body.focusId : undefined
  } catch {
    // empty body is fine
  }
  const snapshot = await getSnapshot()
  const run = await runAgent(snapshot, { focusId })
  return Response.json(run)
}

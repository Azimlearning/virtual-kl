import { getSnapshot } from "@/lib/kl/snapshot"

export const dynamic = "force-dynamic"

export async function GET() {
  const snapshot = await getSnapshot()
  return Response.json(snapshot)
}

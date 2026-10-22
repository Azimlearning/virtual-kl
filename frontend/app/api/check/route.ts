import { z } from "zod"
import { checkPhoto } from "@/lib/kl/check"
import { focusById } from "@/lib/kl/geo"
import { LlmNotConfigured, llmConfigured } from "@/lib/kl/llm"
import { allowLlmCall } from "@/lib/kl/ratelimit"
import { getSnapshot } from "@/lib/kl/snapshot"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const Body = z.object({
  imageBase64: z.string().min(100).max(4_200_000),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  focusId: z.string().optional(),
})

export async function POST(req: Request) {
  if (!llmConfigured()) {
    return Response.json(
      { error: "Photo check needs a vision model. Set ANTHROPIC_API_KEY on the server (see refdocs/guides/env_setup.md)." },
      { status: 503 },
    )
  }
  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return Response.json({ error: "Expected { imageBase64, mediaType } with an image under ~3 MB." }, { status: 400 })
  }
  if (!allowLlmCall(req, "check", 6)) {
    return Response.json({ error: "Too many photo checks just now. Please wait a minute and try again." }, { status: 429 })
  }
  try {
    const focus = focusById(body.focusId ?? "klcc")
    const snapshot = await getSnapshot()
    const result = await checkPhoto({
      imageBase64: body.imageBase64,
      mediaType: body.mediaType,
      lat: focus.lat,
      lon: focus.lon,
      snapshot,
    })
    return Response.json(result)
  } catch (e) {
    if (e instanceof LlmNotConfigured) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: `Photo check failed: ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}` }, { status: 502 })
  }
}

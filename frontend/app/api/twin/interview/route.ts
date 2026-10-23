import { z } from "zod"
import { LlmNotConfigured, generateText, llmConfigured } from "@/lib/kl/llm"
import { INTERVIEW_SYSTEM, explain, templateAnswer, type ResidentFacts } from "@/lib/twin/interview"
import { allowLlmCall } from "@/lib/kl/ratelimit"
import { PERSONA_BY_ID } from "@/lib/twin/personas"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const Body = z.object({
  persona: z.enum(["commuter", "parent", "student", "elderly", "respiratory", "outdoor-worker", "remote-worker", "shift-worker"]),
  channel: z.enum(["whatsapp", "official", "social", "none"]),
  trust: z.number().min(0).max(1),
  informedHoursBeforeEvent: z.number().nullable(),
  acted: z.boolean(),
  exposureHours: z.number().min(0).max(48),
  intervention: z.string().max(120),
  message: z.enum(["generic", "complete", "none"]),
  siteManaged: z.boolean().optional(),
  question: z.string().min(2).max(300),
})

export async function POST(req: Request) {
  let b: z.infer<typeof Body>
  try {
    b = Body.parse(await req.json())
  } catch {
    return Response.json({ error: "Invalid interview request" }, { status: 400 })
  }
  const facts: ResidentFacts = {
    persona: b.persona,
    channel: b.channel,
    trust: b.trust,
    informedHoursBeforeEvent: b.informedHoursBeforeEvent,
    acted: b.acted,
    exposureHours: b.exposureHours,
    intervention: b.intervention,
    message: b.message,
    siteManaged: b.siteManaged,
  }
  const persona = PERSONA_BY_ID[b.persona]
  let source: "claude" | "template" = "template"
  let answer = templateAnswer(facts, b.question)
  if (llmConfigured() && allowLlmCall(req, "interview", 20)) {
    try {
      answer = await generateText({
        system: INTERVIEW_SYSTEM,
        user: JSON.stringify({
          persona: persona.label,
          about_you: persona.blurb,
          what_happened: explain(facts),
          expected_hours_outdoors_in_haze: Math.round(b.exposureHours * 10) / 10,
          intervention_tested: b.intervention,
          question: b.question,
        }),
        maxTokens: 800,
      })
      // If the model was still cut off, end on the last complete sentence rather than mid-word.
      if (!/[.!?"”)]$/.test(answer)) {
        const end = Math.max(answer.lastIndexOf(". "), answer.lastIndexOf("! "), answer.lastIndexOf("? "))
        if (end > 40) answer = answer.slice(0, end + 1)
      }
      source = "claude"
    } catch (e) {
      if (!(e instanceof LlmNotConfigured)) {
        answer = templateAnswer(facts, b.question)
      }
    }
  }
  return Response.json({ answer, source, simulated: true, persona: persona.label })
}

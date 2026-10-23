import type { ChannelId, PersonaId } from "./types"
import { PERSONA_BY_ID } from "./personas"

/** What happened to one simulated resident, in plain facts the interview must stay inside. */
export type ResidentFacts = {
  persona: PersonaId
  channel: ChannelId
  trust: number
  informedHoursBeforeEvent: number | null // negative = after the event began
  acted: boolean
  exposureHours: number
  intervention: string
  message: "generic" | "complete" | "none"
  /** A site manager changed this resident's outdoor work (rescheduled heavy tasks, added rest breaks). */
  siteManaged?: boolean
}

const CHANNEL_WORDS: Record<ChannelId, string> = {
  whatsapp: "my WhatsApp groups",
  official: "official apps and SMS",
  social: "social media",
  none: "no regular news channel",
}

export function explain(f: ResidentFacts): string[] {
  const r: string[] = []
  if (f.informedHoursBeforeEvent == null) r.push("never heard about the haze event")
  else if (f.informedHoursBeforeEvent < 0) r.push(`only heard ${Math.abs(f.informedHoursBeforeEvent)} h after the haze began`)
  else r.push(`heard ${f.informedHoursBeforeEvent} h before the haze`)
  if (f.informedHoursBeforeEvent != null) {
    r.push(f.acted ? "decided to change plans" : f.message === "generic" ? "did not act: the message didn't say what to do" : "did not act")
  }
  if (f.siteManaged) r.push("your site manager, who was notified, rescheduled heavy outdoor work and added rest breaks for the crew")
  r.push(`usually hears things via ${CHANNEL_WORDS[f.channel]}`)
  return r
}

export const INTERVIEW_SYSTEM = `You are role-playing ONE SIMULATED resident of Kuala Lumpur in a planning sandbox. You are not a real person.
Answer the interviewer in 2-3 short sentences, first person, plain language (a little Malaysian English is fine).
Stay strictly inside the FACTS given. Never invent events, numbers, places or quotes beyond them. If asked something the facts don't cover, say you're not sure.
Begin the answer with nothing else (no labels).`

export function templateAnswer(f: ResidentFacts, question: string): string {
  const p = PERSONA_BY_ID[f.persona]
  const via = CHANNEL_WORDS[f.channel]
  if (f.siteManaged) {
    return `Our site manager got the alert and moved the heavy work to cooler, cleaner hours and gave us more rest breaks, so I didn't have to decide on my own. (Simulated ${p.label.toLowerCase()} · template answer to: "${question}")`
  }
  if (f.informedHoursBeforeEvent == null) {
    return `Honestly, I didn't hear anything. I'm mostly on ${via}, and nothing reached me, so I carried on as usual. (Simulated ${p.label.toLowerCase()} · template answer to: "${question}")`
  }
  if (f.informedHoursBeforeEvent < 0) {
    return `I only found out after the haze had already set in, through ${via}. By then I was already outside. (Simulated ${p.label.toLowerCase()} · template answer to: "${question}")`
  }
  if (f.acted) {
    return `I got the message ${f.informedHoursBeforeEvent} hours ahead via ${via}, and it told me what to do, so I changed my plans and wore a mask. (Simulated ${p.label.toLowerCase()} · template answer to: "${question}")`
  }
  return `I saw the message via ${via}, but ${f.message === "generic" ? "it didn't tell me what to do or why it mattered to me" : "I couldn't really change my day"}, so I carried on. (Simulated ${p.label.toLowerCase()} · template answer to: "${question}")`
}

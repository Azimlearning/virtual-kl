import Anthropic from "@anthropic-ai/sdk"
import type { z } from "zod"

/**
 * The only place the frontend talks to an LLM (D-06). Server-side only: this file reads
 * ANTHROPIC_API_KEY and must never be imported from a client component.
 *
 * Every caller handles `LlmNotConfigured` by falling back to a *labelled* template
 * (source: "template") — except vision, which has no honest fallback and says so.
 */

export const DEFAULT_MODEL = "claude-sonnet-5-5"

export class LlmNotConfigured extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Add it to frontend/.env.local (see refdocs/guides/env_setup.md).")
    this.name = "LlmNotConfigured"
  }
}

/** The slice of the Anthropic client we use. Tests inject a fake. */
export type LlmClient = {
  messages: {
    create: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }>
  }
}

let override: LlmClient | null = null
export function setLlmClientForTests(c: LlmClient | null) {
  override = c
}

export function llmConfigured(): boolean {
  return Boolean(override) || Boolean(process.env.ANTHROPIC_API_KEY)
}

export function modelName(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
}

function client(): LlmClient {
  if (override) return override
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new LlmNotConfigured()
  return new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 }) as unknown as LlmClient
}

function textOf(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim()
}

export async function generateText(opts: { system: string; user: string; maxTokens?: number }): Promise<string> {
  const res = await client().messages.create({
    model: modelName(),
    max_tokens: opts.maxTokens ?? 1000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  })
  return textOf(res)
}

/** Pull the first JSON object/array out of a model reply (handles code fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.search(/[\[{]/)
  if (start < 0) throw new Error("No JSON found in model reply")
  const open = body[start]
  const close = open === "{" ? "}" : "]"
  const end = body.lastIndexOf(close)
  if (end <= start) throw new Error("Unterminated JSON in model reply")
  return JSON.parse(body.slice(start, end + 1))
}

export async function generateJson<T>(opts: {
  system: string
  user: string
  schema: z.ZodType<T>
  maxTokens?: number
}): Promise<T> {
  const ask = async (extra = "") => {
    const text = await generateText({
      system: opts.system + "\nReply with a single JSON value and nothing else." + extra,
      user: opts.user,
      maxTokens: opts.maxTokens ?? 1800,
    })
    return opts.schema.parse(extractJson(text))
  }
  try {
    return await ask()
  } catch (e) {
    if (e instanceof LlmNotConfigured) throw e
    // One retry for malformed JSON / schema mismatch.
    return ask("\nYour previous reply was not valid for the schema. Follow the schema exactly.")
  }
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

export async function describeImage<T>(opts: {
  system: string
  prompt: string
  imageBase64: string
  mediaType: ImageMediaType
  schema: z.ZodType<T>
}): Promise<T> {
  const res = await client().messages.create({
    model: modelName(),
    max_tokens: 800,
    system: opts.system + "\nReply with a single JSON object and nothing else.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
          { type: "text", text: opts.prompt },
        ],
      },
    ],
  })
  return opts.schema.parse(extractJson(textOf(res)))
}

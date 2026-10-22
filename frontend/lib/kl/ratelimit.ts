/**
 * Best-effort, in-memory limiter for the endpoints that spend Anthropic credit.
 * A public demo URL must not let one visitor drain the key. State is per server instance
 * (serverless instances don't share it), so also set a monthly spend limit in the Anthropic Console.
 */
const hits = new Map<string, number[]>()
let globalHits: number[] = []

const GLOBAL_PER_HOUR = Number(process.env.LLM_CALLS_PER_HOUR ?? 400)

function prune(list: number[], windowMs: number, now: number) {
  while (list.length && now - list[0] > windowMs) list.shift()
}

/** True if this caller may make a model call now (and records it). */
export function allowLlmCall(req: Request, bucket: string, perMinute: number, now = Date.now()): boolean {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const key = `${bucket}:${fwd || req.headers.get("x-real-ip") || "local"}`
  const mine = hits.get(key) ?? []
  prune(mine, 60_000, now)
  prune(globalHits, 3_600_000, now)
  if (mine.length >= perMinute || globalHits.length >= GLOBAL_PER_HOUR) {
    hits.set(key, mine)
    return false
  }
  mine.push(now)
  globalHits.push(now)
  hits.set(key, mine)
  if (hits.size > 5000) hits.clear()
  return true
}

export function resetRateLimitsForTests() {
  hits.clear()
  globalHits = []
}

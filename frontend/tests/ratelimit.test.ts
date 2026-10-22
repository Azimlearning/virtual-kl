import { beforeEach, describe, expect, it } from "vitest"
import { allowLlmCall, resetRateLimitsForTests } from "@/lib/kl/ratelimit"

const req = (ip: string) => new Request("http://x/api", { headers: { "x-forwarded-for": ip } })

describe("allowLlmCall", () => {
  beforeEach(resetRateLimitsForTests)

  it("allows up to the per-minute limit per caller, then refuses", () => {
    for (let i = 0; i < 3; i++) expect(allowLlmCall(req("1.1.1.1"), "agent", 3, 1000 + i)).toBe(true)
    expect(allowLlmCall(req("1.1.1.1"), "agent", 3, 1010)).toBe(false)
  })
  it("does not let one caller use up another's allowance", () => {
    for (let i = 0; i < 3; i++) allowLlmCall(req("1.1.1.1"), "agent", 3, 1000)
    expect(allowLlmCall(req("2.2.2.2"), "agent", 3, 1000)).toBe(true)
  })
  it("forgives after the window passes", () => {
    for (let i = 0; i < 3; i++) allowLlmCall(req("1.1.1.1"), "agent", 3, 1000)
    expect(allowLlmCall(req("1.1.1.1"), "agent", 3, 62_000)).toBe(true)
  })
})

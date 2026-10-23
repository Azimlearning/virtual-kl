import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { SLIDES, TOUR_STOPS, forgetForTests, markIntroSeen, markTourSeen, replayIntro, stageFor, subscribeToIntro } from "@/lib/intro"

describe("intro and tour state", () => {
  beforeEach(() => {
    replayIntro()
    forgetForTests()
  })

  it("goes intro → tour → done, in order", () => {
    expect(stageFor()).toBe("intro")
    markIntroSeen()
    expect(stageFor()).toBe("tour")
    markTourSeen()
    expect(stageFor()).toBe("done")
  })

  it("works without any storage (private window, blocked cookies): the visit is remembered in memory", () => {
    // this test runs in node, where there is no window.localStorage at all
    markIntroSeen()
    markTourSeen()
    expect(stageFor()).toBe("done")
  })

  it("replay brings the slides back and tells subscribers", () => {
    markIntroSeen()
    markTourSeen()
    let calls = 0
    const off = subscribeToIntro(() => calls++)
    replayIntro()
    expect(stageFor()).toBe("intro")
    expect(calls).toBe(1)
    off()
    markIntroSeen()
    expect(calls).toBe(1)
  })

  it("marking notifies subscribers so the gate re-renders", () => {
    let calls = 0
    const off = subscribeToIntro(() => calls++)
    markIntroSeen()
    markTourSeen()
    expect(calls).toBe(2)
    off()
  })
})

describe("intro copy and tour stops", () => {
  it("has three slides and says it is a prototype with simulated residents", () => {
    expect(SLIDES).toHaveLength(3)
    const all = SLIDES.map((s) => s.title + " " + s.text).join(" ")
    expect(all).toMatch(/simulated/i)
    expect(all).toMatch(/prototype/i)
    expect(all).toMatch(/Red is never sent automatically/)
  })

  it("every tour stop points at a data-tour target that exists in the twin view", () => {
    const src = fs.readFileSync(path.join(__dirname, "../components/kl/twin-view.tsx"), "utf8")
    for (const s of TOUR_STOPS) expect(src).toContain(`data-tour="${s.target}"`)
  })
})

describe("motion css", () => {
  const css = fs.readFileSync(path.join(__dirname, "../app/globals.css"), "utf8")
  it("defines the keyframes the intro uses", () => {
    for (const k of ["intro-draw", "intro-rise", "intro-pop", "ob-in-next", "ob-in-back", "ob-float"]) expect(css).toContain(`@keyframes ${k}`)
  })
  it("also zeroes animation delays under reduced motion, so delayed pictures are not left blank", () => {
    const at = css.indexOf("@media (prefers-reduced-motion: reduce)")
    expect(at).toBeGreaterThan(-1)
    const block = css.slice(at, at + 400)
    expect(block).toMatch(/animation-delay: 0s !important/)
    expect(block).toMatch(/animation-iteration-count: 1 !important/)
  })
})

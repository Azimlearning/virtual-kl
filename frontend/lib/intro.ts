/**
 * First-run intro and tour state (D-29). Remembered per browser in localStorage, with an in-memory copy so a
 * blocked or full storage never shows the slides twice in one visit. Same pattern as the onboarding guide
 * (refdocs/guides/onboarding-intro-and-tour.md), minus the per-user keys: this demo has no sign-in.
 */
export type Stage = "intro" | "tour" | "done"

const INTRO_KEY = "virtual-kl.intro.seen"
const TOUR_KEY = "virtual-kl.tour.seen"

const subscribers = new Set<() => void>()
const memory = new Set<string>()

function seen(key: string): boolean {
  if (memory.has(key)) return true
  try {
    return window.localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function mark(key: string) {
  memory.add(key)
  try {
    window.localStorage.setItem(key, "1")
  } catch {
    /* the memory mark covers this visit */
  }
  subscribers.forEach((notify) => notify())
}

export function stageFor(): Stage {
  if (!seen(INTRO_KEY)) return "intro"
  return seen(TOUR_KEY) ? "done" : "tour"
}

export const markIntroSeen = () => mark(INTRO_KEY)
export const markTourSeen = () => mark(TOUR_KEY)

/** Clear both flags and tell everyone, so the slides play again. */
export function replayIntro() {
  for (const key of [INTRO_KEY, TOUR_KEY]) {
    memory.delete(key)
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* nothing stored */
    }
  }
  subscribers.forEach((notify) => notify())
}

export function subscribeToIntro(notify: () => void) {
  subscribers.add(notify)
  if (typeof window !== "undefined") window.addEventListener("storage", notify)
  return () => {
    subscribers.delete(notify)
    if (typeof window !== "undefined") window.removeEventListener("storage", notify)
  }
}

export const forgetForTests = () => memory.clear()

export type Slide = { title: string; text: string }

/** The words, in one place so they can be tested and edited without touching the components. */
export const SLIDES: Slide[] = [
  {
    title: "A rehearsal room for Kuala Lumpur's air",
    text: "Thousands of simulated residents move around a township while the real October haze replays. The air data is live; everything on the map is simulated.",
  },
  {
    title: "An agent that acts first",
    text: "It checks Kuala Lumpur every minute, rehearses every option on the twin, drafts advisories in English and Bahasa Malaysia, and asks you only for decisions. Red is never sent automatically.",
  },
  {
    title: "You decide, and you can test the plan",
    text: "Try other options, add a site-manager action, pick a resident and interview them. Nothing is sent: this is a prototype, and the behaviour numbers are illustrative until the resident survey.",
  },
]

export type TourStop = { target: string; title: string; text: string }

export const TOUR_STOPS: TourStop[] = [
  { target: "map", title: "The twin", text: "Each dot is a simulated resident. Grey: not yet aware. Amber: informed. Green: protected. Red: outdoors in the haze." },
  { target: "timeline", title: "The 48 hours", text: "Play, pause or drag to any hour. It starts playing by itself." },
  { target: "agent", title: "The agent works on its own", text: "What it noticed, rehearsed and drafted appears here. \"Needs you\" means it is waiting for your decision." },
  { target: "interventions", title: "Its pick, and your options", text: "The agent already picked the option that leaves residents least exposed. Try the others and compare." },
  { target: "interview", title: "Ask a resident", text: "Click a dot, or pick a type of resident here, then ask them why they acted or didn't." },
]

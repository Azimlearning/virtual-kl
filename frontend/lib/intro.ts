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

export type TourStop = { path: string; target: string; title: string; text: string }

/** The tour walks the whole app and moves between pages by itself; each stop names the page it lives on. */
export const TOUR_STOPS: TourStop[] = [
  { path: "/", target: "map", title: "The twin", text: "Each dot is a simulated resident. Grey: not yet aware. Amber: informed. Green: protected. Red: outdoors in the haze." },
  { path: "/", target: "timeline", title: "The 48 hours", text: "Play, pause or drag to any hour. It starts playing by itself." },
  { path: "/", target: "agent", title: "The agent works on its own", text: "What it noticed, rehearsed and drafted appears here. \"Needs you\" means it is waiting for your decision." },
  { path: "/", target: "interventions", title: "Its pick, and your options", text: "The agent already picked the option that leaves residents least exposed. Try the others and compare." },
  { path: "/", target: "interview", title: "Ask a resident", text: "Click a dot, or pick a type of resident here, then ask them why they acted or didn't." },
  { path: "/agent", target: "agent-activity", title: "Everything it did without being asked", text: "The same feed in full: it noticed, rehearsed, drafted. Approving a draft sends nothing in this prototype." },
  { path: "/agent", target: "agent-console", title: "Run the full loop on demand", text: "Watch, anticipate, rehearse, decide, act, step by step, with the guardrail check on each advisory." },
  { path: "/live", target: "live-map", title: "The real air it is acting on", text: "Live DOE readings, SDP developments ringed, and the haze over the city. The flood layer is greyed because that feed is frozen." },
  { path: "/live", target: "agent-dock", title: "The agent follows you", text: "On every other page it waits here, with a badge when it has something for you." },
  { path: "/check", target: "photo-upload", title: "Check a resident's photo", text: "A vision model reads the photo; our code compares it with the nearest live sensor." },
  { path: "/about", target: "methods", title: "What is real and what is simulated", text: "Live source status, the assumptions, and the known limits, in one place." },
]

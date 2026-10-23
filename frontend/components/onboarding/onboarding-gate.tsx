"use client"

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"
import { Intro } from "@/components/onboarding/intro"
import { Tour } from "@/components/onboarding/tour"
import { markIntroSeen, markTourSeen, stageFor, subscribeToIntro } from "@/lib/intro"

/**
 * Mounted once in the root layout. Shows the intro and then the tour, which walks across the pages by itself, once per
 * browser. The page behind is inert while either shows. Server snapshot is "done", so a
 * returning visitor never sees a flash of the slides.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const stage = useSyncExternalStore(subscribeToIntro, stageFor, () => "done" as const)
  const showTour = stage === "tour"
  const active = stage === "intro" || showTour
  const wasActive = useRef(active)

  useEffect(() => {
    if (wasActive.current && !active) document.getElementById("main")?.focus()
    wasActive.current = active
  }, [active])

  return (
    <>
      <div inert={active}>{children}</div>
      {stage === "intro" && (
        <Intro
          onTour={markIntroSeen}
          onSkip={() => {
            markIntroSeen()
            markTourSeen()
          }}
        />
      )}
      {showTour && <Tour onDone={markTourSeen} />}
    </>
  )
}

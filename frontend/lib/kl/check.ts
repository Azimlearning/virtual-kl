import { z } from "zod"
import type { Corroboration, PhotoCheckResult, PhotoObservation, Snapshot } from "./types"
import { describeImage, type ImageMediaType } from "./llm"
import { nearestStation } from "./scoring"

/**
 * Ground-truth photo check (M4). A model reads one photo; our code compares that reading with
 * the nearest live DOE station. The result is "indicative" (a reading of a photo, not a
 * measurement) and says "unverified" whenever there is no live sensor to compare with.
 */

export const ObservationSchema = z.object({
  // Tolerant on purpose: a live run returned 7 observations and the strict schema turned a good answer into a 502.
  hazard: z.enum(["haze", "smoke", "flood", "fire", "other", "none"]).catch("other"),
  visibility: z.enum(["good", "moderate", "poor", "very-poor", "unknown"]).catch("unknown"),
  observations: z.array(z.string()).transform((a) => a.slice(0, 6)),
  confidence: z.number().transform((n) => Math.min(1, Math.max(0, n))).catch(0.5),
})

export const CHECK_SYSTEM = `You are an image analyst for a city safety dashboard in Kuala Lumpur.
Describe only what is visible in the photo. Do not guess the location or time. Do not identify people.
Return JSON: {"hazard":"haze|smoke|flood|fire|other|none","visibility":"good|moderate|poor|very-poor|unknown","observations":[short strings],"confidence":0..1}.
- "visibility" is how far you can clearly see (skyline/buildings/landmarks fading into grey = poor).
- If the photo shows no hazard, use "none". If you cannot tell, lower the confidence.`

export const CHECK_PROMPT = "Analyse this photo for haze, smoke, flooding or fire. Reply with the JSON object only."

export function corroborate(
  obs: PhotoObservation,
  snapshot: Pick<Snapshot, "stations" | "status">,
  lat: number,
  lon: number,
): Corroboration {
  const near = nearestStation(lat, lon, snapshot.stations)
  const nearest = near
    ? {
        name: near.station.name,
        api: near.station.api,
        category: near.station.category,
        distanceKm: Math.round(near.distanceKm * 10) / 10,
        observedAt: near.station.observedAt,
      }
    : null
  const reasons: string[] = []

  if (obs.hazard === "haze" || obs.hazard === "smoke") {
    if (!nearest || nearest.api == null) {
      return { verdict: "unverified", reasons: ["No live DOE reading to compare with."], nearestStation: nearest }
    }
    const poor = obs.visibility === "poor" || obs.visibility === "very-poor"
    const good = obs.visibility === "good"
    if (nearest.api > 100 && poor) {
      reasons.push(`Photo shows ${obs.visibility.replace("-", " ")} visibility; ${nearest.name} (${nearest.distanceKm} km away) reads API ${nearest.api} (${nearest.category}).`)
      return { verdict: "corroborated", reasons, nearestStation: nearest }
    }
    if (nearest.api <= 50 && poor) {
      reasons.push(`Photo shows poor visibility but ${nearest.name} reads API ${nearest.api} (Good). Local smoke or a different time of day could explain it.`)
      return { verdict: "contradicted", reasons, nearestStation: nearest }
    }
    if (nearest.api > 150 && good) {
      reasons.push(`Photo shows good visibility but ${nearest.name} reads API ${nearest.api} (${nearest.category}).`)
      return { verdict: "contradicted", reasons, nearestStation: nearest }
    }
    reasons.push(`Photo (${obs.visibility}) and ${nearest.name} reading (API ${nearest.api}, ${nearest.category}) are neither clearly consistent nor clearly in conflict.`)
    return { verdict: "unverified", reasons, nearestStation: nearest }
  }

  if (obs.hazard === "flood") {
    reasons.push(
      snapshot.status.jps.stale
        ? `The JPS water-level feed for KL is frozen (last update ${snapshot.status.jps.observedAt?.slice(0, 10) ?? "unknown"}), so there is no live sensor to check this against.`
        : "No flood-depth sensor is wired into this prototype.",
    )
    return { verdict: "unverified", reasons, nearestStation: nearest }
  }

  if (obs.hazard === "fire") {
    return { verdict: "unverified", reasons: ["No live sensor in this prototype can confirm a fire; contact the Fire and Rescue Department (999)."], nearestStation: nearest }
  }

  return { verdict: "unverified", reasons: ["No clear hazard was identified in the photo."], nearestStation: nearest }
}

export async function checkPhoto(input: {
  imageBase64: string
  mediaType: ImageMediaType
  lat: number
  lon: number
  snapshot: Snapshot
}): Promise<PhotoCheckResult> {
  const observation = await describeImage({
    system: CHECK_SYSTEM,
    prompt: CHECK_PROMPT,
    imageBase64: input.imageBase64,
    mediaType: input.mediaType,
    schema: ObservationSchema,
  })
  return {
    observation,
    corroboration: corroborate(observation, input.snapshot, input.lat, input.lon),
    indicative: true,
  }
}

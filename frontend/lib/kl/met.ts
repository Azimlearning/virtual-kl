/** MET Malaysia forecast text is in Bahasa Melayu; this maps the common phrases to English for display. */
const MAP: Record<string, string> = {
  "tiada hujan": "No rain",
  cerah: "Fair",
  "cerah berawan": "Partly cloudy",
  berawan: "Cloudy",
  mendung: "Overcast",
  jerebu: "Haze",
  berjerebu: "Haze",
  berkabus: "Foggy",
  berpanau: "Hazy mist",
  "hujan di satu dua tempat": "Rain in a few places",
  "hujan di beberapa tempat": "Rain in some places",
  "hujan di kebanyakan tempat": "Rain in most places",
  "hujan di kebanyakan tempat.": "Rain in most places",
  hujan: "Rain",
  "hujan lebat": "Heavy rain",
  "ribut petir di satu dua tempat": "Thunderstorms in a few places",
  "ribut petir di beberapa tempat": "Thunderstorms in some places",
  "ribut petir di kebanyakan tempat": "Thunderstorms in most places",
  "ribut petir": "Thunderstorms",
}

export function metEn(text: string | null | undefined): string {
  if (!text) return ""
  return MAP[text.trim().toLowerCase()] ?? text
}

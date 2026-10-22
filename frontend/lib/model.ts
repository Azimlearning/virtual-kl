import { google } from "@ai-sdk/google"

// Synthesis + report generation run on Google Gemini via a personal
// Google AI Studio API key (free tier, no credit card required).
// The @ai-sdk/google provider reads GOOGLE_GENERATIVE_AI_API_KEY from the env.
export const synthesisModel = google("gemini-2.5-flash")

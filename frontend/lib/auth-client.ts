"use client"

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
} from "firebase/auth"
import { firebaseAuth } from "@/lib/firebase/client"

/**
 * Exchanges a freshly minted Firebase ID token for a secure, HttpOnly
 * session cookie set by our server route. The client SDK signs the user
 * in only to obtain the token; server-verified sessions gate every page.
 */
async function establishSession(idToken: string) {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to establish session")
  }
  // The HttpOnly cookie is now the source of truth; drop the client session.
  await fbSignOut(firebaseAuth).catch(() => {})
}

function friendlyError(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password."
    case "auth/email-already-in-use":
      return "An account with this email already exists."
    case "auth/weak-password":
      return "Password should be at least 6 characters."
    case "auth/invalid-email":
      return "Please enter a valid email address."
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later."
    default:
      return "Something went wrong. Please try again."
  }
}

export async function signUpWithEmail(email: string, password: string, name: string) {
  try {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password)
    if (name) await updateProfile(cred.user, { displayName: name })
    const idToken = await cred.user.getIdToken(true)
    await establishSession(idToken)
    return { error: null }
  } catch (err) {
    const code = (err as { code?: string }).code ?? ""
    return { error: { message: code ? friendlyError(code) : (err as Error).message } }
  }
}

export async function signInWithEmail(email: string, password: string) {
  try {
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, password)
    const idToken = await cred.user.getIdToken(true)
    await establishSession(idToken)
    return { error: null }
  } catch (err) {
    const code = (err as { code?: string }).code ?? ""
    return { error: { message: code ? friendlyError(code) : (err as Error).message } }
  }
}

export async function signOut() {
  await fetch("/api/auth/session", { method: "DELETE" })
  await fbSignOut(firebaseAuth).catch(() => {})
}

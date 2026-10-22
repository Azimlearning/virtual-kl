import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getAdminAuth } from "@/lib/firebase/admin"
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth"

// Exchange a Firebase ID token (from client sign-in) for a secure,
// httpOnly session cookie that server components can verify.
export async function POST(req: Request) {
  try {
    const { idToken } = await req.json()
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 })
    }

    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    })

    const store = await cookies()
    store.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    })

    return NextResponse.json({ status: "ok" })
  } catch (err) {
    console.log("[v0] session creation failed:", (err as Error).message)
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }
}

// Sign out: clear the session cookie.
export async function DELETE() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  return NextResponse.json({ status: "ok" })
}

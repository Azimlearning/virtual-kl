// Firebase auth intentionally removed for now. RBAC is scoped as a
// lightweight, later addition (see project README) and the Python
// backend doesn't gate any endpoint on auth yet either. This stub keeps
// every page/action that calls getCurrentUser() working unchanged -
// always "signed in" as a single default operator, no redirect to a
// sign-in page, no Firebase SDK/credentials needed.

export type SessionUser = {
  uid: string
  email: string | null
  name: string | null
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return { uid: "local-operator", email: null, name: "Operator" }
}

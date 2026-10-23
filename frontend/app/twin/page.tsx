import { redirect } from "next/navigation"

// The twin is the home page now (D-28); keep the old address working.
export default function TwinRedirect() {
  redirect("/")
}

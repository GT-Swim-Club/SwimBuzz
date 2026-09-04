"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { ATHLETE_VIEW_COOKIE } from "@/lib/athlete/athlete-view"
import { getSession } from "@/lib/auth/session"

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/** Same cookie the client previously set directly via document.cookie before
 * calling router.refresh() — now set server-side so the revalidated render
 * sees it in the same pass. */
export async function setAthleteView(enabled: boolean) {
  const session = await getSession()
  if (!session) throw new Error("Forbidden")

  const store = await cookies()
  store.set(ATHLETE_VIEW_COOKIE, enabled ? "1" : "0", {
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    sameSite: "lax"})

  revalidatePath("/", "layout")
}

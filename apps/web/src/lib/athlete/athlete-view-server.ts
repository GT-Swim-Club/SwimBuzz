import { cache } from "react"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { isStaffRole } from "@swimbuzz/shared"
import { ATHLETE_VIEW_COOKIE, isAthleteViewCookie } from "@/lib/athlete/athlete-view"

export const isAthleteViewEnabled = cache(async (): Promise<boolean> => {
  const store = await cookies()
  return isAthleteViewCookie(store.get(ATHLETE_VIEW_COOKIE)?.value)
})

/**
 * Athlete to treat as "you" in the UI — the roster athlete linked to this
 * session's user. Staff are roster athletes too, so Athlete View needs no
 * separate preview id: it's always the signed-in user's own profile.
 *
 * Wrapped in React cache() — called from multiple server components per
 * request (page + nested sections), so this collapses repeat calls into one
 * Prisma round trip.
 */
export const resolveViewerAthleteId = cache(async (
  sessionUserId: string
): Promise<string | null> => {
  const linked = await prisma.athlete.findUnique({
    where: { userId: sessionUserId },
    select: { id: true },
  })
  return linked?.id ?? null
})

/**
 * Whether to show staff UI. Real COACH/EXEC keep API privileges;
 * Athlete View only affects what the app renders.
 */
export const isStaffUi = cache(async (role: string): Promise<boolean> => {
  if (!isStaffRole(role)) return false
  return !(await isAthleteViewEnabled())
})

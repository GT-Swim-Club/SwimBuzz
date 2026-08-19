import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { isStaffRole } from "@/lib/auth-roles"
import { ATHLETE_VIEW_COOKIE, isAthleteViewCookie } from "@/lib/athlete-view"

export async function isAthleteViewEnabled(): Promise<boolean> {
  const store = await cookies()
  return isAthleteViewCookie(store.get(ATHLETE_VIEW_COOKIE)?.value)
}

/**
 * Athlete to treat as "you" in the UI — the roster athlete linked to this
 * session's user. Staff are roster athletes too, so Athlete View needs no
 * separate preview id: it's always the signed-in user's own profile.
 */
export async function resolveViewerAthleteId(
  sessionUserId: string
): Promise<string | null> {
  const linked = await prisma.athlete.findUnique({
    where: { userId: sessionUserId },
    select: { id: true },
  })
  return linked?.id ?? null
}

/**
 * Whether to show staff UI. Real COACH/EXEC keep API privileges;
 * Athlete View only affects what the app renders.
 */
export async function isStaffUi(role: string): Promise<boolean> {
  if (!isStaffRole(role)) return false
  return !(await isAthleteViewEnabled())
}

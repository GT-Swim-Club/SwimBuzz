import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { isStaffRole } from "@/lib/auth-roles"
import {
  ATHLETE_VIEW_COOKIE,
  parseAthleteViewCookie,
} from "@/lib/athlete-view"

export async function isAthleteViewEnabled(): Promise<boolean> {
  const store = await cookies()
  return parseAthleteViewCookie(store.get(ATHLETE_VIEW_COOKIE)?.value).enabled
}

/**
 * Athlete id selected for staff preview, or null when not previewing / invalid id.
 */
export async function getAthleteViewAthleteId(): Promise<string | null> {
  const store = await cookies()
  const { enabled, athleteId } = parseAthleteViewCookie(
    store.get(ATHLETE_VIEW_COOKIE)?.value
  )
  if (!enabled || !athleteId) return null
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, firstName: true, lastName: true, nicknames: true },
  })
  return athlete?.id ?? null
}

export async function getAthleteViewAthlete(): Promise<{
  id: string
  firstName: string
  lastName: string
  nicknames: string[]
} | null> {
  const store = await cookies()
  const { enabled, athleteId } = parseAthleteViewCookie(
    store.get(ATHLETE_VIEW_COOKIE)?.value
  )
  if (!enabled || !athleteId) return null
  return prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, firstName: true, lastName: true, nicknames: true },
  })
}

/**
 * Athlete to treat as "you" in the UI: staff preview athlete, else linked profile.
 * Preview cookie is only honored for staff so it can't leak across a later athlete login.
 */
export async function resolveViewerAthleteId(
  sessionUserId: string,
  role: string
): Promise<string | null> {
  if (isStaffRole(role)) {
    const previewId = await getAthleteViewAthleteId()
    if (previewId) return previewId
  }
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

import { isStaffRole } from "@swimbuzz/shared"

type Viewer = { user: { id: string; role: string } }

/** Staff see every athlete's contact and ID details; athletes only their own. */
export function canSeeAthletePrivate(viewer: Viewer, athlete: { userId: string }): boolean {
  return isStaffRole(viewer.user.role) || athlete.userId === viewer.user.id
}

/**
 * Blank out email, GTID, and DOB for viewers who may not see them.
 * Fields are nulled rather than dropped so the response shape stays the same for both clients
 * (mobile still finds its own athlete by email, which it keeps).
 */
export function redactAthleteForViewer<
  T extends {
    userId: string
    gtid?: string | null
    dob?: Date | null
    user?: { email?: string | null } | null
  },
>(athlete: T, viewer: Viewer): T {
  if (canSeeAthletePrivate(viewer, athlete)) return athlete
  return {
    ...athlete,
    ...("gtid" in athlete ? { gtid: null } : {}),
    ...("dob" in athlete ? { dob: null } : {}),
    user: athlete.user ? { ...athlete.user, email: null } : athlete.user,
  }
}

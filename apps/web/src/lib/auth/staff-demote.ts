import { prisma } from "@/lib/prisma"

/**
 * Signing in through the Athletes tab ends a user's staff rank: the role and
 * title are cleared until they sign in again via Coaches & Exec (which
 * re-grants them from their @gtswimclub.com mailbox). Returns the user as
 * it now stands, so callers can issue a session with the demoted role.
 */
export async function demoteStaffToAthlete<
  T extends { id: string; role: string; staffTitle: unknown },
>(user: T): Promise<T> {
  if (!user.staffTitle) return user
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ATHLETE", staffTitle: null },
  })
  return { ...user, role: "ATHLETE", staffTitle: null }
}

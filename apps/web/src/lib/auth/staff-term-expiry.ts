import { prisma } from "@/lib/prisma"
import { currentStaffTerm } from "@swimbuzz/shared"

/**
 * Demote any staff title whose `staffTerm` isn't the current one back to a
 * plain athlete. Titles are claimed with a term stamp (see the NextAuth
 * `signIn` callback) and never demoted by a new claim — several people can
 * share one @gtswimclub.com mailbox — so this cron is the only thing that
 * actually ends a term. It's what makes the exec board's annual turnover
 * (1 May, see currentStaffTerm()) take effect: leaving a stale role in the
 * DB would change nothing, since every permission check reads `role`.
 *
 * Self-healing: anyone still on staff regains access the next time they sign
 * in, which re-stamps staffTerm to the current term.
 */
export async function demoteLapsedStaff(): Promise<{ demoted: number }> {
  const term = currentStaffTerm()
  const { count } = await prisma.user.updateMany({
    where: {
      staffTitle: { not: null },
      staffTerm: { not: term },
    },
    data: { role: "ATHLETE", staffTitle: null, staffTerm: null },
  })
  return { demoted: count }
}

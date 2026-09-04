import { prisma } from "@/lib/prisma"
import {
  buildAthleteLookup,
  findNearMatchAthlete,
  matchAthleteIdFast,
  type AthleteLookup,
  type NearMatchAthlete,
  type RosterAthlete,
} from "@/lib/athlete/athlete-match"

/** Shared athlete resolution for form-response imports: email -> fuzzy name -> manual fix-up. */

export type FormImportRosterContext = {
  lookup: AthleteLookup
  byEmail: Map<string, string>
}

/** Season-scoped roster + user email, for matching Google Form rows to athletes. */
export async function loadFormImportRoster(season: string): Promise<FormImportRosterContext> {
  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nicknames: true,
      user: { select: { email: true } },
    },
  })

  const roster: RosterAthlete[] = athletes.map((a) => ({
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    nicknames: a.nicknames,
  }))

  const byEmail = new Map<string, string>()
  for (const a of athletes) {
    if (a.user.email) byEmail.set(a.user.email.toLowerCase(), a.id)
  }

  return { lookup: buildAthleteLookup(roster), byEmail }
}

export type ImportRowMatch = {
  athleteId: string | null
  matchedBy: "override" | "email" | "name" | null
  suggestion: NearMatchAthlete | null
}

/**
 * Resolve a parsed row to a roster athlete. `override` (from the review
 * step's manual fix-up) wins when provided — including an explicit `null`,
 * which means "skip this row". When omitted, falls back to email, then
 * exact/nickname name matching, then a near-match suggestion only.
 */
export function matchImportRow(
  raw: { name: string; email: string },
  ctx: FormImportRosterContext,
  override?: string | null
): ImportRowMatch {
  if (override !== undefined) {
    return { athleteId: override, matchedBy: override ? "override" : null, suggestion: null }
  }

  const email = raw.email.trim().toLowerCase()
  if (email) {
    const byEmail = ctx.byEmail.get(email)
    if (byEmail) return { athleteId: byEmail, matchedBy: "email", suggestion: null }
  }

  const name = raw.name.trim()
  if (name) {
    const fast = matchAthleteIdFast(name, ctx.lookup)
    if (fast) return { athleteId: fast, matchedBy: "name", suggestion: null }

    const suggestion = findNearMatchAthlete(name, ctx.lookup.roster)
    if (suggestion) return { athleteId: null, matchedBy: null, suggestion }
  }

  return { athleteId: null, matchedBy: null, suggestion: null }
}

import { Gender } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  buildAthleteLookup,
  matchAthleteIdFast,
  normalizeNicknames,
  parseRosterName,
  type AthleteLookup,
} from "@/lib/athlete-match"

export type RosterImportAthlete = {
  id: string
  userId: string
  firstName: string
  lastName: string
  nicknames: string[]
  gender: Gender
  seasons: string[]
  swimCloudId: number | null
  userEmail: string
}

export type RosterImportInput = {
  firstName: string
  lastName: string
  gender: Gender
  email?: string
  swimCloudId?: number
  nicknames?: string[]
}

export type RosterImportContext = {
  roster: RosterImportAthlete[]
  lookup: AthleteLookup
  bySwimCloudId: Map<number, RosterImportAthlete>
  byEmail: Map<string, RosterImportAthlete>
}

export async function loadRosterImportContext(): Promise<RosterImportContext> {
  const athletes = await prisma.athlete.findMany({
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      nicknames: true,
      gender: true,
      seasons: true,
      swimCloudId: true,
      user: { select: { email: true } },
    },
  })

  const roster: RosterImportAthlete[] = athletes.map((athlete) => ({
    id: athlete.id,
    userId: athlete.userId,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    nicknames: athlete.nicknames,
    gender: athlete.gender,
    seasons: athlete.seasons,
    swimCloudId: athlete.swimCloudId,
    userEmail: athlete.user.email,
  }))

  const bySwimCloudId = new Map<number, RosterImportAthlete>()
  const byEmail = new Map<string, RosterImportAthlete>()
  for (const athlete of roster) {
    if (athlete.swimCloudId != null) {
      bySwimCloudId.set(athlete.swimCloudId, athlete)
    }
    byEmail.set(athlete.userEmail.toLowerCase(), athlete)
  }

  return {
    roster,
    lookup: buildAthleteLookup(roster),
    bySwimCloudId,
    byEmail,
  }
}

export function findAthleteForImport(
  input: RosterImportInput,
  context: RosterImportContext
): RosterImportAthlete | null {
  if (input.swimCloudId != null) {
    const byId = context.bySwimCloudId.get(input.swimCloudId)
    if (byId) return byId
  }

  if (input.email) {
    const byMail = context.byEmail.get(input.email.toLowerCase())
    if (byMail) return byMail
  }

  const athleteId = matchAthleteIdFast(`${input.firstName} ${input.lastName}`, context.lookup)
  if (!athleteId) return null

  return context.roster.find((athlete) => athlete.id === athleteId) ?? null
}

export function swimCloudIdConflict(
  input: RosterImportInput,
  athlete: RosterImportAthlete | null,
  context: RosterImportContext
): RosterImportAthlete | null {
  if (input.swimCloudId == null) return null
  const owner = context.bySwimCloudId.get(input.swimCloudId)
  if (!owner || owner.id === athlete?.id) return null
  return owner
}

function placeholderEmail(
  firstName: string,
  lastName: string,
  swimCloudId?: number,
  suffix = 0
): string {
  if (swimCloudId) return `${swimCloudId}@swimcloud.placeholder`
  const base = `${lastName}.${firstName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
  return suffix > 0 ? `${base}.${suffix}@roster.placeholder` : `${base || "athlete"}@roster.placeholder`
}

function isPlaceholderEmail(email: string): boolean {
  const lower = email.toLowerCase()
  return lower.endsWith("@roster.placeholder") || lower.endsWith("@swimcloud.placeholder")
}

const athleteSelect = {
  id: true,
  userId: true,
  firstName: true,
  lastName: true,
  nicknames: true,
  gender: true,
  seasons: true,
  swimCloudId: true,
  user: { select: { email: true } },
} as const

function toRosterAthlete(updated: {
  id: string
  userId: string
  firstName: string
  lastName: string
  nicknames: string[]
  gender: Gender
  seasons: string[]
  swimCloudId: number | null
  user: { email: string }
}): RosterImportAthlete {
  return {
    id: updated.id,
    userId: updated.userId,
    firstName: updated.firstName,
    lastName: updated.lastName,
    nicknames: updated.nicknames,
    gender: updated.gender,
    seasons: updated.seasons,
    swimCloudId: updated.swimCloudId,
    userEmail: updated.user.email,
  }
}

/** Apply CSV email onto the athlete's user, claiming orphan users that hold the address. */
async function applyImportEmail(
  athlete: RosterImportAthlete,
  nextEmail: string
): Promise<void> {
  const email = nextEmail.toLowerCase()
  if (email === athlete.userEmail.toLowerCase()) return

  const conflict = await prisma.user.findUnique({
    where: { email },
    include: { athlete: { select: { id: true } } },
  })

  if (!conflict) {
    await prisma.user.update({
      where: { id: athlete.userId },
      data: { email },
    })
    return
  }

  // Another athlete already owns this email.
  if (conflict.athlete && conflict.athlete.id !== athlete.id) return

  // Orphan user (or this athlete's user under a different code path) already has the email.
  // Point the athlete at that user and drop the placeholder account when needed.
  if (conflict.id === athlete.userId) return

  const oldUserId = athlete.userId
  await prisma.$transaction(async (tx) => {
    await tx.athlete.update({
      where: { id: athlete.id },
      data: { userId: conflict.id },
    })
    if (isPlaceholderEmail(athlete.userEmail)) {
      await tx.user.delete({ where: { id: oldUserId } }).catch(() => undefined)
    }
  })
}

export async function mergeImportAthlete(
  athlete: RosterImportAthlete,
  input: RosterImportInput,
  season: string
): Promise<RosterImportAthlete> {
  const seasons = athlete.seasons.includes(season)
    ? athlete.seasons
    : [...athlete.seasons, season]
  const nicknames = normalizeNicknames([...(input.nicknames ?? []), ...athlete.nicknames])

  if (input.email) {
    await applyImportEmail(athlete, input.email)
  }

  const updated = await prisma.athlete.update({
    where: { id: athlete.id },
    data: {
      seasons,
      nicknames,
      ...(input.swimCloudId != null && athlete.swimCloudId == null
        ? { swimCloudId: input.swimCloudId }
        : {}),
    },
    select: athleteSelect,
  })

  return toRosterAthlete(updated)
}

export async function createImportAthlete(
  input: RosterImportInput,
  season: string,
  rowNumber?: number
): Promise<RosterImportAthlete> {
  let email = input.email ?? placeholderEmail(input.firstName, input.lastName, input.swimCloudId)
  const nicknames = normalizeNicknames(input.nicknames ?? [])

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { athlete: true },
  })

  // Reuse an existing user account that has no athlete profile yet.
  if (existingUser && !existingUser.athlete) {
    const athlete = await prisma.athlete.create({
      data: {
        userId: existingUser.id,
        firstName: input.firstName,
        lastName: input.lastName,
        nicknames,
        gender: input.gender,
        seasons: [season],
        ...(input.swimCloudId != null ? { swimCloudId: input.swimCloudId } : {}),
      },
      select: athleteSelect,
    })

    if (existingUser.name !== `${input.firstName} ${input.lastName}`) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { name: `${input.firstName} ${input.lastName}`, role: "ATHLETE" },
      })
    }

    return toRosterAthlete(athlete)
  }

  if (existingUser?.athlete) {
    email = placeholderEmail(input.firstName, input.lastName, undefined, rowNumber ?? 0)
  }

  let suffix = 1
  while (await prisma.user.findUnique({ where: { email } })) {
    email = placeholderEmail(input.firstName, input.lastName, undefined, suffix++)
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: `${input.firstName} ${input.lastName}`,
      role: "ATHLETE",
    },
  })

  const athlete = await prisma.athlete.create({
    data: {
      userId: user.id,
      firstName: input.firstName,
      lastName: input.lastName,
      nicknames,
      gender: input.gender,
      seasons: [season],
      ...(input.swimCloudId != null ? { swimCloudId: input.swimCloudId } : {}),
    },
    select: athleteSelect,
  })

  return toRosterAthlete(athlete)
}

export function registerImportAthlete(
  context: RosterImportContext,
  athlete: RosterImportAthlete
): void {
  const existing = context.roster.find((entry) => entry.id === athlete.id)
  if (existing) {
    const oldEmail = existing.userEmail.toLowerCase()
    Object.assign(existing, athlete)
    if (oldEmail !== athlete.userEmail.toLowerCase()) {
      context.byEmail.delete(oldEmail)
    }
  } else {
    context.roster.push(athlete)
  }

  context.lookup = buildAthleteLookup(context.roster)
  if (athlete.swimCloudId != null) {
    context.bySwimCloudId.set(athlete.swimCloudId, athlete)
  }
  context.byEmail.set(athlete.userEmail.toLowerCase(), athlete)
}

export { parseRosterName as parseSwimCloudName } from "@/lib/athlete-match"

export type SwimCloudRosterRow = {
  swimmer_name: string
  swimmer_ID: string
}

export async function applySwimCloudRosterImport(
  roster: SwimCloudRosterRow[],
  _season: string,
  gender: Gender
) {
  let linked = 0
  let unmatched = 0
  let skippedConflict = 0
  let alreadyLinked = 0
  const context = await loadRosterImportContext()

  // Only match against athletes of this gender — roster itself comes from CSV.
  const genderRoster = context.roster.filter((athlete) => athlete.gender === gender)
  const matchContext: RosterImportContext = {
    roster: genderRoster,
    lookup: buildAthleteLookup(genderRoster),
    bySwimCloudId: context.bySwimCloudId,
    byEmail: context.byEmail,
  }

  for (const swimmer of roster) {
    const swimCloudId = parseInt(swimmer.swimmer_ID, 10)
    if (!swimCloudId || swimCloudId <= 0) continue

    const { firstName, lastName } = parseRosterName(swimmer.swimmer_name.trim())
    if (!firstName || !lastName) continue

    const input: RosterImportInput = {
      firstName,
      lastName,
      gender,
      swimCloudId,
    }

    const existing = findAthleteForImport(input, matchContext)
    if (!existing) {
      unmatched++
      continue
    }

    const conflict = swimCloudIdConflict(input, existing, context)
    if (conflict) {
      console.warn(
        `[roster swimcloud ids] SwimCloud ID ${swimCloudId} conflict for ${firstName} ${lastName}`
      )
      skippedConflict++
      continue
    }

    if (existing.swimCloudId === swimCloudId) {
      alreadyLinked++
      continue
    }

    if (existing.swimCloudId != null) {
      // Keep the existing ID; do not overwrite from SwimCloud name match.
      alreadyLinked++
      continue
    }

    const updated = await prisma.athlete.update({
      where: { id: existing.id },
      data: { swimCloudId },
      select: athleteSelect,
    })

    const rosterAthlete = toRosterAthlete(updated)
    registerImportAthlete(context, rosterAthlete)
    // Keep matchContext maps in sync for later rows in this batch
    registerImportAthlete(matchContext, rosterAthlete)
    linked++
  }

  return {
    created: 0,
    updated: linked,
    linked,
    unmatched,
    skippedConflict,
    alreadyLinked,
    total: roster.length,
  }
}

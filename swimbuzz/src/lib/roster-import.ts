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

export async function mergeImportAthlete(
  athlete: RosterImportAthlete,
  input: RosterImportInput,
  season: string
): Promise<RosterImportAthlete> {
  const seasons = athlete.seasons.includes(season)
    ? athlete.seasons
    : [...athlete.seasons, season]
  const nicknames = normalizeNicknames([...(input.nicknames ?? []), ...athlete.nicknames])

  const updated = await prisma.athlete.update({
    where: { id: athlete.id },
    data: {
      seasons,
      nicknames,
      ...(input.swimCloudId != null && athlete.swimCloudId == null
        ? { swimCloudId: input.swimCloudId }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nicknames: true,
      gender: true,
      seasons: true,
      swimCloudId: true,
      user: { select: { email: true } },
    },
  })

  return {
    id: updated.id,
    firstName: updated.firstName,
    lastName: updated.lastName,
    nicknames: updated.nicknames,
    gender: updated.gender,
    seasons: updated.seasons,
    swimCloudId: updated.swimCloudId,
    userEmail: updated.user.email,
  }
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
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nicknames: true,
      gender: true,
      seasons: true,
      swimCloudId: true,
      user: { select: { email: true } },
    },
  })

  return {
    id: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    nicknames: athlete.nicknames,
    gender: athlete.gender,
    seasons: athlete.seasons,
    swimCloudId: athlete.swimCloudId,
    userEmail: athlete.user.email,
  }
}

export function registerImportAthlete(
  context: RosterImportContext,
  athlete: RosterImportAthlete
): void {
  const existing = context.roster.find((entry) => entry.id === athlete.id)
  if (existing) {
    Object.assign(existing, athlete)
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
  season: string,
  gender: Gender
) {
  let created = 0
  let updated = 0
  const context = await loadRosterImportContext()

  for (const swimmer of roster) {
    const swimCloudId = parseInt(swimmer.swimmer_ID, 10)
    if (!swimCloudId || swimCloudId <= 0) continue

    const { firstName, lastName, nicknames } = parseRosterName(swimmer.swimmer_name.trim())
    if (!firstName || !lastName) continue

    const input: RosterImportInput = {
      firstName,
      lastName,
      gender,
      swimCloudId,
      ...(nicknames.length > 0 ? { nicknames } : {}),
    }

    const existing = findAthleteForImport(input, context)
    const conflict = swimCloudIdConflict(input, existing, context)
    if (conflict) {
      console.warn(
        `[roster swimcloud import] SwimCloud ID ${swimCloudId} conflict for ${firstName} ${lastName}`
      )
      continue
    }

    if (existing) {
      const merged = await mergeImportAthlete(existing, input, season)
      registerImportAthlete(context, merged)
      updated++
      continue
    }

    const athlete = await createImportAthlete(input, season)
    registerImportAthlete(context, athlete)
    created++
  }

  return { created, updated, total: roster.length }
}

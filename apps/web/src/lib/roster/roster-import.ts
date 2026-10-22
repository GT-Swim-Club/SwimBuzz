import { Gender } from "@prisma/client"
import { formatSeasonLabel } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import {
  buildAthleteLookup,
  matchAthleteIdFast,
  parseRosterName,
  type AthleteLookup,
} from "@/lib/athlete/athlete-match"
import { uniqueAthleteSlug } from "@/lib/slug"
import { MAX_SWIMCLOUD_IDS } from "@/lib/swim/swimcloud-id"
import type { ParsedRosterCsvRow } from "@/lib/roster/roster-csv"

export type RosterImportAthlete = {
  id: string
  userId: string
  firstName: string
  lastName: string
  preferredName: string | null
  gender: Gender
  seasons: string[]
  swimCloudIds: number[]
  gtid: string | null
  dob: Date | null
  year: string | null
  userEmail: string
}

export type RosterImportInput = {
  firstName: string
  lastName: string
  gender: Gender
  email?: string
  preferredName?: string | null
  gtid?: string | null
  dob?: Date | null
  year?: string | null
  /** Main profile first. */
  swimCloudIds?: number[]
}

export type RosterImportContext = {
  roster: RosterImportAthlete[]
  lookup: AthleteLookup
  bySwimCloudId: Map<number, RosterImportAthlete>
  byEmail: Map<string, RosterImportAthlete>
  byGtid: Map<string, RosterImportAthlete>
}

export async function loadRosterImportContext(): Promise<RosterImportContext> {
  const athletes = await prisma.athlete.findMany({
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      gender: true,
      seasons: true,
      swimCloudIds: true,
      gtid: true,
      dob: true,
      year: true,
      user: { select: { email: true } },
    },
  })

  const roster: RosterImportAthlete[] = athletes.map((athlete) => ({
    id: athlete.id,
    userId: athlete.userId,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    preferredName: athlete.preferredName,
    gender: athlete.gender,
    seasons: athlete.seasons,
    swimCloudIds: athlete.swimCloudIds,
    gtid: athlete.gtid,
    dob: athlete.dob,
    year: athlete.year,
    userEmail: athlete.user.email,
  }))

  const bySwimCloudId = new Map<number, RosterImportAthlete>()
  const byEmail = new Map<string, RosterImportAthlete>()
  const byGtid = new Map<string, RosterImportAthlete>()
  for (const athlete of roster) {
    for (const id of athlete.swimCloudIds) bySwimCloudId.set(id, athlete)
    byEmail.set(athlete.userEmail.toLowerCase(), athlete)
    const gtid = athlete.gtid?.trim()
    if (gtid && !byGtid.has(gtid)) byGtid.set(gtid, athlete)
  }

  return {
    roster,
    lookup: buildAthleteLookup(roster),
    bySwimCloudId,
    byEmail,
    byGtid,
  }
}

export function findAthleteForImport(
  input: RosterImportInput,
  context: RosterImportContext
): RosterImportAthlete | null {
  if (input.email) {
    const byMail = context.byEmail.get(input.email.toLowerCase())
    if (byMail) return byMail
  }

  const gtid = input.gtid?.trim()
  if (gtid) {
    const byGtid = context.byGtid.get(gtid)
    if (byGtid) return byGtid
  }

  for (const id of input.swimCloudIds ?? []) {
    const bySwimCloud = context.bySwimCloudId.get(id)
    if (bySwimCloud) return bySwimCloud
  }

  const athleteId = matchAthleteIdFast(`${input.firstName} ${input.lastName}`, context.lookup)
  if (!athleteId) return null

  return context.roster.find((athlete) => athlete.id === athleteId) ?? null
}

export function swimCloudIdConflict(
  _input: RosterImportInput,
  _athlete: RosterImportAthlete | null,
  _context: RosterImportContext
): RosterImportAthlete | null {
  return null
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
  preferredName: true,
  gender: true,
  seasons: true,
  swimCloudIds: true,
  gtid: true,
  dob: true,
  year: true,
  user: { select: { email: true } },
} as const

function toRosterAthlete(updated: {
  id: string
  userId: string
  firstName: string
  lastName: string
  preferredName: string | null
  gender: Gender
  seasons: string[]
  swimCloudIds: number[]
  gtid: string | null
  dob: Date | null
  year: string | null
  user: { email: string }
}): RosterImportAthlete {
  return {
    id: updated.id,
    userId: updated.userId,
    firstName: updated.firstName,
    lastName: updated.lastName,
    preferredName: updated.preferredName,
    gender: updated.gender,
    seasons: updated.seasons,
    swimCloudIds: updated.swimCloudIds,
    gtid: updated.gtid ?? null,
    dob: updated.dob ?? null,
    year: updated.year ?? null,
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

/**
 * SwimCloud IDs after an import row: the row's IDs first (so its leftmost is the
 * main profile), then stored IDs the row didn't list, up to MAX_SWIMCLOUD_IDS.
 * Undefined when the row has no SwimCloud IDs, which keeps the stored list.
 */
function importedSwimCloudProfiles(
  input: RosterImportInput,
  athlete?: RosterImportAthlete
) {
  if (!input.swimCloudIds?.length) return undefined
  const swimCloudIds = [...new Set([...input.swimCloudIds, ...(athlete?.swimCloudIds ?? [])])]
  return { swimCloudIds: swimCloudIds.slice(0, MAX_SWIMCLOUD_IDS) }
}

export async function mergeImportAthlete(
  athlete: RosterImportAthlete,
  input: RosterImportInput,
  season: string
): Promise<RosterImportAthlete> {
  const seasons = athlete.seasons.includes(season)
    ? athlete.seasons
    : [...athlete.seasons, season]

  if (input.email) {
    await applyImportEmail(athlete, input.email)
  }

  const updated = await prisma.athlete.update({
    where: { id: athlete.id },
    data: {
      seasons,
      firstName: input.firstName,
      lastName: input.lastName,
      gender: input.gender,
      // A filled preferred-name cell replaces whatever is stored. A blank cell
      // leaves an existing preferred name alone.
      ...(input.preferredName ? { preferredName: input.preferredName } : {}),
      ...(input.gtid != null ? { gtid: input.gtid } : {}),
      ...(input.dob != null ? { dob: input.dob } : {}),
      ...(input.year != null ? { year: input.year } : {}),
      ...importedSwimCloudProfiles(input, athlete),
    },
    select: athleteSelect,
  })

  const nextName = `${input.firstName} ${input.lastName}`
  await prisma.user.update({
    where: { id: updated.userId },
    data: { name: nextName },
  })

  return toRosterAthlete(updated)
}

export async function createImportAthlete(
  input: RosterImportInput,
  season: string,
  rowNumber?: number
): Promise<RosterImportAthlete> {
  let email = input.email ?? placeholderEmail(input.firstName, input.lastName, undefined)
  const preferredName = input.preferredName ?? null

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { athlete: true },
  })

  // Reuse an existing user account that has no athlete profile yet.
  if (existingUser && !existingUser.athlete) {
    const slug = await uniqueAthleteSlug(input.firstName, input.lastName)
    const athlete = await prisma.athlete.create({
      data: {
        userId: existingUser.id,
        slug,
        firstName: input.firstName,
        lastName: input.lastName,
        preferredName,
        gender: input.gender,
        seasons: [season],
        ...(input.gtid != null ? { gtid: input.gtid } : {}),
        ...(input.dob != null ? { dob: input.dob } : {}),
        ...(input.year != null ? { year: input.year } : {}),
        ...importedSwimCloudProfiles(input),
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

  const slug = await uniqueAthleteSlug(input.firstName, input.lastName)
  const athlete = await prisma.athlete.create({
    data: {
      userId: user.id,
      slug,
      firstName: input.firstName,
      lastName: input.lastName,
      preferredName,
      gender: input.gender,
      seasons: [season],
      ...(input.gtid != null ? { gtid: input.gtid } : {}),
      ...(input.dob != null ? { dob: input.dob } : {}),
      ...(input.year != null ? { year: input.year } : {}),
      ...importedSwimCloudProfiles(input),
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
    const oldSwimCloudIds = existing.swimCloudIds
    Object.assign(existing, athlete)
    if (oldEmail !== athlete.userEmail.toLowerCase()) {
      context.byEmail.delete(oldEmail)
    }
    const nextSwimCloudIds = athlete.swimCloudIds
    for (const id of oldSwimCloudIds) {
      if (!nextSwimCloudIds.includes(id) && context.bySwimCloudId.get(id)?.id === athlete.id) {
        context.bySwimCloudId.delete(id)
      }
    }
  } else {
    context.roster.push(athlete)
  }

  context.lookup = buildAthleteLookup(context.roster)
  for (const id of athlete.swimCloudIds) context.bySwimCloudId.set(id, athlete)
  context.byEmail.set(athlete.userEmail.toLowerCase(), athlete)
  const gtid = athlete.gtid?.trim()
  if (gtid) context.byGtid.set(gtid, athlete)
}

export type RosterImportRowOutcome = {
  row: number
  action: "created" | "updated" | "skipped"
  name: string
  detail?: string
}

export type RosterImportSummary = {
  created: number
  updated: number
  removed: number
  parsed: number
  errors: Array<{ row: number; message: string }>
  rowOutcomes: RosterImportRowOutcome[]
}

/**
 * Replace one season's roster from parsed rows (CSV upload, Google Sheets, ...).
 * Each row updates a matched athlete or creates one, then anyone still on that
 * season who was not in the file is taken off it. Other seasons are left alone.
 */
export async function runRosterImport(
  rows: ParsedRosterCsvRow[],
  season: string,
  parseErrors: Array<{ row: number; message: string }>
): Promise<RosterImportSummary> {
  let created = 0
  let updated = 0
  const errors: RosterImportSummary["errors"] = [...parseErrors]
  const rowOutcomes: RosterImportRowOutcome[] = []
  const keptIds = new Set<string>()

  const context = await loadRosterImportContext()

  if (rows.length === 0) {
    return { created, updated, removed: 0, parsed: 0, errors, rowOutcomes }
  }

  for (const row of rows) {
    const input: RosterImportInput = {
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender === "F" ? Gender.F : Gender.M,
      ...(row.email ? { email: row.email } : {}),
      ...(row.gtid ? { gtid: row.gtid } : {}),
      ...(row.dob && !Number.isNaN(row.dob.getTime()) ? { dob: row.dob } : {}),
      ...(row.year ? { year: row.year } : {}),
      ...(row.preferredName ? { preferredName: row.preferredName } : {}),
      ...(row.swimCloudIds?.length ? { swimCloudIds: row.swimCloudIds } : {}),
    }

    const existing = findAthleteForImport(input, context)
    // Drop IDs another athlete already holds.
    input.swimCloudIds = input.swimCloudIds?.filter((id) => {
      const owner = context.bySwimCloudId.get(id)
      return !owner || owner.id === existing?.id
    })
    const label = `${row.lastName}, ${row.firstName}`

    try {
      if (existing) {
        // Keep them on the season even if this row's write fails.
        keptIds.add(existing.id)
        const hadSeason = existing.seasons.includes(season)
        const merged = await mergeImportAthlete(existing, input, season)
        registerImportAthlete(context, merged)
        updated++
        rowOutcomes.push({
          row: row.rowNumber,
          action: "updated",
          name: label,
          detail: hadSeason ? "merged with existing athlete" : `added to ${formatSeasonLabel(season)}`,
        })
        continue
      }

      const athlete = await createImportAthlete(input, season, row.rowNumber)
      registerImportAthlete(context, athlete)
      keptIds.add(athlete.id)
      created++
      rowOutcomes.push({
        row: row.rowNumber,
        action: "created",
        name: label,
        detail: row.email ?? athlete.userEmail,
      })
    } catch (err) {
      console.error(`[roster import] row ${row.rowNumber} (${label}) failed:`, err)
      errors.push({
        row: row.rowNumber,
        message: err instanceof Error ? err.message : "Could not save this athlete",
      })
    }
  }

  const dropping = context.roster.filter(
    (athlete) => !keptIds.has(athlete.id) && athlete.seasons.includes(season)
  )
  // One statement per athlete. A wrapping transaction cannot run on the
  // transaction-mode pooler (DATABASE_URL, port 6543).
  for (const athlete of dropping) {
    await prisma.athlete.update({
      where: { id: athlete.id },
      data: { seasons: athlete.seasons.filter((entry) => entry !== season) },
    })
  }

  return { created, updated, removed: dropping.length, parsed: rows.length, errors, rowOutcomes }
}

export { parseRosterName as parseSwimCloudName } from "@/lib/athlete/athlete-match"

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
    byGtid: context.byGtid,
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
      swimCloudIds: [swimCloudId],
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

    if (existing.swimCloudIds.includes(swimCloudId)) {
      alreadyLinked++
      continue
    }

    if (existing.swimCloudIds.length > 0) {
      // Keep the existing IDs; do not add to them from a SwimCloud name match.
      alreadyLinked++
      continue
    }

    const updated = await prisma.athlete.update({
      where: { id: existing.id },
      data: { swimCloudIds: [swimCloudId] },
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

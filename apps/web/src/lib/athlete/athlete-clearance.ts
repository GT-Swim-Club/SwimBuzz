import { prisma } from "@/lib/prisma"
import { seasonFromDate } from "@/lib/season"
import {
  missingClearance,
  zonedDayKey,
  type AthleteClearanceStatus,
  type AthleteClearanceSummary,
  type ClearanceCheck,
  type ClearanceItemInput,
  type ClearanceListAthlete,
  type ClearanceListResponse,
} from "@swimbuzz/shared"

/**
 * Physical & concussion clearance, one record per athlete (both are done once, not per
 * season). Completion status only — no dates, nothing medical. Staff only: never send it
 * to non-staff viewers (roster/athlete payloads include it only for staff).
 */

type ClearanceRow = {
  physicalCleared: boolean
  concussionCleared: boolean
  source: string
  updatedAt: Date
}

const clearanceSelect = {
  physicalCleared: true,
  concussionCleared: true,
  source: true,
  updatedAt: true,
} as const

/** Select for the completion-only summary carried on roster and athlete payloads. */
export const clearanceSummarySelect = { physicalCleared: true, concussionCleared: true } as const

/** `{ physical: { cleared }, concussion: { cleared } }`; nothing recorded = both incomplete. */
export function clearanceSummary(
  row: { physicalCleared: boolean; concussionCleared: boolean } | null | undefined
): AthleteClearanceSummary {
  return {
    physical: { cleared: row?.physicalCleared ?? false },
    concussion: { cleared: row?.concussionCleared ?? false },
  }
}

export function serializeClearance(row: ClearanceRow | null | undefined): AthleteClearanceStatus {
  return {
    physical: { cleared: row?.physicalCleared ?? false },
    concussion: { cleared: row?.concussionCleared ?? false },
    source: row ? (row.source === "MANUAL" ? "MANUAL" : "IMPORT") : null,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  }
}

/** Season a practice falls in (same rule as the attendance page's roster). */
export function practiceSeason(practice: {
  startsAt: Date | null
  createdAt: Date
  timeZone: string
}): string {
  return seasonFromDate(zonedDayKey(practice.startsAt ?? practice.createdAt, practice.timeZone))
}

/** Missing checks per athlete; athletes with nothing recorded miss both. */
export async function missingClearanceByAthlete(athleteIds: string[]): Promise<Map<string, ClearanceCheck[]>> {
  const ids = Array.from(new Set(athleteIds))
  const rows = ids.length
    ? await prisma.athleteClearance.findMany({
        where: { athleteId: { in: ids } },
        select: { athleteId: true, ...clearanceSelect },
      })
    : []
  const byAthlete = new Map(rows.map((r) => [r.athleteId, r]))
  return new Map(ids.map((id) => [id, missingClearance(serializeClearance(byAthlete.get(id)))]))
}

/** Add `uncleared` (missing checks) to staff attendance records. Staff-only callers. */
export async function withAttendanceClearance<T extends { athleteId: string }>(
  records: T[]
): Promise<Array<T & { uncleared: ClearanceCheck[] }>> {
  const missing = await missingClearanceByAthlete(records.map((r) => r.athleteId))
  return records.map((r) => ({ ...r, uncleared: missing.get(r.athleteId) ?? [] }))
}

const listAthleteSelect = {
  id: true,
  slug: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  gender: true,
  clearance: { select: clearanceSelect },
} as const

type ListAthleteRow = {
  id: string
  slug: string | null
  firstName: string
  lastName: string
  preferredName: string | null
  gender: string
  clearance: ClearanceRow | null
}

function listAthlete(a: ListAthleteRow): ClearanceListAthlete {
  return {
    ...serializeClearance(a.clearance),
    athleteId: a.id,
    slug: a.slug,
    firstName: a.firstName,
    lastName: a.lastName,
    preferredName: a.preferredName,
    gender: a.gender === "F" ? "F" : "M",
  }
}

/** Every athlete on a season's roster with their clearance (the season only picks the roster). Staff-only callers. */
export async function listSeasonClearance(season: string): Promise<ClearanceListResponse> {
  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: listAthleteSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
  return { season, athletes: athletes.map(listAthlete) }
}

/** One athlete's clearance. */
export async function athleteClearance(athleteId: string): Promise<AthleteClearanceStatus> {
  const row = await prisma.athleteClearance.findUnique({ where: { athleteId }, select: clearanceSelect })
  return serializeClearance(row)
}

export type ClearanceUpdate = {
  physical?: { cleared: boolean }
  concussion?: { cleared: boolean }
}

/** Validate a hand correction's item. */
export function parseClearanceItemInput(raw: unknown): ClearanceUpdate["physical"] | "invalid" | undefined {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== "object") return "invalid"
  const item = raw as ClearanceItemInput
  if (typeof item.cleared !== "boolean") return "invalid"
  return { cleared: item.cleared }
}

function updateData(update: ClearanceUpdate) {
  return {
    ...(update.physical ? { physicalCleared: update.physical.cleared } : {}),
    ...(update.concussion ? { concussionCleared: update.concussion.cleared } : {}),
  }
}

/** Write one athlete's clearance; checks left out keep their value. */
export function upsertClearanceQuery(athleteId: string, update: ClearanceUpdate, source: "IMPORT" | "MANUAL") {
  const data = updateData(update)
  return prisma.athleteClearance.upsert({
    where: { athleteId },
    create: { athleteId, source, ...data },
    update: { source, ...data },
    select: clearanceSelect,
  })
}

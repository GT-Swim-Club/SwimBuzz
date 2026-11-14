import { prisma } from "@/lib/prisma"
import { canSeeAthletePrivate } from "@/lib/athlete/athlete-privacy"
import { seasonFromDate } from "@/lib/season"
import {
  missingClearance,
  zonedDayKey,
  type AthleteClearanceStatus,
  type ClearanceCheck,
  type ClearanceItemInput,
  type ClearanceListResponse,
} from "@swimbuzz/shared"

/**
 * Physical & concussion clearance per athlete per season. Cleared status and dates only.
 * Privacy: staff and the athlete themself — the same rule as GTID/DOB
 * (`canSeeAthletePrivate`). Never join clearance into roster or athlete payloads;
 * read it through these helpers from staff-only or self-only routes.
 */

export const canSeeAthleteClearance = canSeeAthletePrivate

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** "YYYY-MM-DD" → UTC midnight, or null when blank/invalid. */
export function dayKeyToDate(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const match = DAY_KEY_RE.exec(value.trim())
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

export function dateToDayKey(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

type ClearanceRow = {
  season: string
  physicalCleared: boolean
  physicalDate: Date | null
  concussionCleared: boolean
  concussionDate: Date | null
  source: string
  updatedAt: Date
}

const clearanceSelect = {
  season: true,
  physicalCleared: true,
  physicalDate: true,
  concussionCleared: true,
  concussionDate: true,
  source: true,
  updatedAt: true,
} as const

export function serializeClearance(row: ClearanceRow | null | undefined, season: string): AthleteClearanceStatus {
  return {
    season,
    physical: { cleared: row?.physicalCleared ?? false, date: dateToDayKey(row?.physicalDate) },
    concussion: { cleared: row?.concussionCleared ?? false, date: dateToDayKey(row?.concussionDate) },
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

/** Missing checks per athlete for a season; athletes with nothing on file miss both. */
export async function missingClearanceByAthlete(
  season: string,
  athleteIds: string[]
): Promise<Map<string, ClearanceCheck[]>> {
  const ids = Array.from(new Set(athleteIds))
  const rows = ids.length
    ? await prisma.athleteClearance.findMany({
        where: { season, athleteId: { in: ids } },
        select: { athleteId: true, ...clearanceSelect },
      })
    : []
  const byAthlete = new Map(rows.map((r) => [r.athleteId, r]))
  return new Map(
    ids.map((id) => [id, missingClearance(serializeClearance(byAthlete.get(id), season))])
  )
}

/** Add `uncleared` (missing checks) to staff attendance records. Staff-only callers. */
export async function withAttendanceClearance<T extends { athleteId: string }>(
  records: T[],
  season: string
): Promise<Array<T & { uncleared: ClearanceCheck[] }>> {
  const missing = await missingClearanceByAthlete(
    season,
    records.map((r) => r.athleteId)
  )
  return records.map((r) => ({ ...r, uncleared: missing.get(r.athleteId) ?? [] }))
}

/** Every athlete on the season roster with their clearance. Staff-only callers. */
export async function listSeasonClearance(
  season: string,
  /** Narrow to one athlete (the athlete page). */
  athleteId?: string
): Promise<ClearanceListResponse> {
  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: season }, ...(athleteId ? { id: athleteId } : {}) },
    select: {
      id: true,
      slug: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      gender: true,
      clearances: { where: { season }, select: clearanceSelect, take: 1 },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
  return {
    season,
    athletes: athletes.map((a) => ({
      ...serializeClearance(a.clearances[0], season),
      athleteId: a.id,
      slug: a.slug,
      firstName: a.firstName,
      lastName: a.lastName,
      preferredName: a.preferredName,
      gender: a.gender === "F" ? "F" : "M",
    })),
  }
}

/** One athlete's clearance for each season they're on, newest first. */
export async function athleteClearanceBySeason(
  athleteId: string,
  seasons: string[]
): Promise<AthleteClearanceStatus[]> {
  const rows = await prisma.athleteClearance.findMany({
    where: { athleteId },
    select: clearanceSelect,
  })
  const bySeason = new Map(rows.map((r) => [r.season, r]))
  const all = Array.from(new Set([...seasons, ...rows.map((r) => r.season)]))
  return all
    .sort((a, b) => b.localeCompare(a))
    .map((season) => serializeClearance(bySeason.get(season), season))
}

export type ClearanceUpdate = {
  physical?: { cleared: boolean; date: Date | null }
  concussion?: { cleared: boolean; date: Date | null }
}

/** Validate a hand correction's item; a date only counts when cleared. */
export function parseClearanceItemInput(raw: unknown): ClearanceUpdate["physical"] | "invalid" | undefined {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== "object") return "invalid"
  const item = raw as ClearanceItemInput
  if (typeof item.cleared !== "boolean") return "invalid"
  if (item.date != null && item.date !== "" && !dayKeyToDate(item.date)) return "invalid"
  return { cleared: item.cleared, date: item.cleared ? dayKeyToDate(item.date) : null }
}

function updateData(update: ClearanceUpdate) {
  return {
    ...(update.physical
      ? { physicalCleared: update.physical.cleared, physicalDate: update.physical.date }
      : {}),
    ...(update.concussion
      ? { concussionCleared: update.concussion.cleared, concussionDate: update.concussion.date }
      : {}),
  }
}

/** Write one athlete's clearance for a season; fields left out keep their value. */
export function upsertClearanceQuery(
  athleteId: string,
  season: string,
  update: ClearanceUpdate,
  source: "IMPORT" | "MANUAL"
) {
  const data = updateData(update)
  return prisma.athleteClearance.upsert({
    where: { athleteId_season: { athleteId, season } },
    create: { athleteId, season, source, ...data },
    update: { source, ...data },
    select: clearanceSelect,
  })
}

import { prisma } from "@/lib/prisma"

/** Buzzcard scanners type the GTID then Enter; GT ids are 9 digits starting with 90. */
const GTID_RE = /90\d{7}/

export const attendanceAthleteSelect = {
  id: true,
  slug: true,
  firstName: true,
  lastName: true,
  gender: true,
  year: true,
  userId: true,
} as const

export type AttendanceAthlete = {
  id: string
  slug: string | null
  firstName: string
  lastName: string
  gender: "M" | "F"
  year: string | null
  userId: string
}

export type AttendanceRecord = {
  id: string
  athleteId: string
  athleteSlug: string | null
  name: string
  gender: "M" | "F"
  year: string | null
  method: "SCAN" | "MANUAL"
  recordedAt: string
}

/**
 * Reduce a scanned/typed value to comparable digits. Some readers emit the bare
 * 9-digit GTID, others wrap it in track data (`;9012345678?`) or separators.
 */
export function normalizeGtid(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D+/g, "")
  if (!digits) return null
  if (digits.length === 9) return digits
  const match = GTID_RE.exec(digits)
  if (match) return match[0]
  // Unrecognized shape — keep the digits so the error message can echo them.
  return digits
}

export function attendanceDisplayName(athlete: {
  firstName: string
  lastName: string
}): string {
  return `${athlete.firstName} ${athlete.lastName}`.trim()
}

export function serializeAttendance(record: {
  id: string
  athleteId: string
  method: string
  recordedAt: Date
  athlete: { slug: string | null; firstName: string; lastName: string; gender: string; year: string | null }
}): AttendanceRecord {
  return {
    id: record.id,
    athleteId: record.athleteId,
    athleteSlug: record.athlete.slug,
    name: attendanceDisplayName(record.athlete),
    gender: record.athlete.gender === "F" ? "F" : "M",
    year: record.athlete.year,
    method: record.method === "MANUAL" ? "MANUAL" : "SCAN",
    recordedAt: record.recordedAt.toISOString(),
  }
}

/**
 * Resolve a scanned Buzzcard value to a roster athlete. Stored GTIDs come from
 * spreadsheet imports and may carry dashes or spaces, so compare on digits.
 */
export async function findAthleteByGtid(scanned: string): Promise<AttendanceAthlete | null> {
  const normalized = normalizeGtid(scanned)
  if (!normalized) return null

  const exact = await prisma.athlete.findFirst({
    where: { gtid: normalized },
    select: attendanceAthleteSelect,
  })
  if (exact) return { ...exact, gender: exact.gender === "F" ? "F" : "M" }

  const candidates = await prisma.athlete.findMany({
    where: { NOT: { gtid: null } },
    select: { ...attendanceAthleteSelect, gtid: true },
  })
  const match = candidates.find((a) => normalizeGtid(a.gtid) === normalized)
  if (!match) return null
  return {
    id: match.id,
    slug: match.slug,
    firstName: match.firstName,
    lastName: match.lastName,
    gender: match.gender === "F" ? "F" : "M",
    year: match.year,
    userId: match.userId,
  }
}

/** User ids of athletes checked in to a practice — drives the comment badge. */
export async function attendedUserIds(practiceId: string): Promise<string[]> {
  const rows = await prisma.practiceAttendance.findMany({
    where: { practiceId },
    select: { athlete: { select: { userId: true } } },
  })
  return Array.from(new Set(rows.map((r) => r.athlete.userId)))
}

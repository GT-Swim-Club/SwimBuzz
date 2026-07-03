import { Course } from "@prisma/client"
import { parseMeetDate } from "@/lib/swim-parse"

export class MeetInputError extends Error {}

const COURSES: Course[] = [Course.SCY, Course.LCM, Course.SCM]

function parseCourse(value: unknown): Course {
  const upper = String(value ?? "").toUpperCase()
  return COURSES.find((c) => c === upper) ?? Course.SCY
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

type BuildOptions = { requireName?: boolean; requireStartDate?: boolean }

/**
 * Validate and normalize meet form input into Prisma create/update data.
 * Only keys present on `body` are included, so it works for partial updates.
 */
export function buildMeetData(body: Record<string, unknown>, opts: BuildOptions = {}) {
  const data: Record<string, unknown> = {}

  if ("name" in body || opts.requireName) {
    const name = String(body.name ?? "").trim()
    if (!name) throw new MeetInputError("Meet name is required")
    data.name = name
  }

  if ("startDate" in body || opts.requireStartDate) {
    const startDate = parseMeetDate(String(body.startDate ?? ""))
    if (!startDate) throw new MeetInputError("A valid start date is required")
    data.startDate = startDate
  }

  if ("endDate" in body) {
    const raw = optionalString(body.endDate)
    if (raw) {
      const endDate = parseMeetDate(raw)
      if (!endDate) throw new MeetInputError("End date is invalid")
      data.endDate = endDate
    } else {
      data.endDate = null
    }
  }

  if ("course" in body) data.course = parseCourse(body.course)

  if ("season" in body) {
    const season = parseInt(String(body.season ?? ""), 10)
    if (!Number.isFinite(season)) throw new MeetInputError("Season year is invalid")
    data.season = season
  } else if (opts.requireStartDate && data.startDate instanceof Date) {
    // Default the season to the start date's year when not provided.
    data.season = (data.startDate as Date).getUTCFullYear()
  }

  if ("location" in body) data.location = optionalString(body.location)
  if ("description" in body) data.description = optionalString(body.description)
  if ("packetUrl" in body) data.packetUrl = optionalString(body.packetUrl)
  if ("psychSheetUrl" in body) data.psychSheetUrl = optionalString(body.psychSheetUrl)
  if ("heatSheetUrl" in body) data.heatSheetUrl = optionalString(body.heatSheetUrl)
  if ("resultsUrl" in body) data.resultsUrl = optionalString(body.resultsUrl)

  return data
}

import { Course } from "@prisma/client"
import { parseMeetDate } from "@/lib/swim-parse"
import { parseSeason, seasonFromDate } from "@/lib/season"

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
    const season = parseSeason(body.season)
    if (!season) throw new MeetInputError("Season must be like 2025-2026")
    data.season = season
  } else if (opts.requireStartDate && data.startDate instanceof Date) {
    data.season = seasonFromDate(data.startDate as Date)
  }

  if ("teamCode" in body) {
    const team = String(body.teamCode ?? "").trim().toUpperCase()
    if (!team) throw new MeetInputError("Team code is required")
    data.teamCode = team
  }

  if ("location" in body) data.location = optionalString(body.location)
  if ("packetUrl" in body) data.packetUrl = optionalString(body.packetUrl)
  if ("psychSheetUrl" in body) data.psychSheetUrl = optionalString(body.psychSheetUrl)
  if ("heatSheetUrl" in body) data.heatSheetUrl = optionalString(body.heatSheetUrl)
  if ("entriesSheetUrl" in body) data.entriesSheetUrl = optionalString(body.entriesSheetUrl)
  if ("resultsUrl" in body) data.resultsUrl = optionalString(body.resultsUrl)
  if ("liveStreamUrl" in body) data.liveStreamUrl = optionalString(body.liveStreamUrl)
  if ("rideSignUpsUrl" in body) data.rideSignUpsUrl = optionalString(body.rideSignUpsUrl)
  if ("roomsUrl" in body) data.roomsUrl = optionalString(body.roomsUrl)
  if ("hotel" in body) data.hotel = optionalString(body.hotel)
  if ("packingList" in body) data.packingList = optionalString(body.packingList)
  if ("itinerary" in body) data.itinerary = optionalString(body.itinerary)

  return data
}

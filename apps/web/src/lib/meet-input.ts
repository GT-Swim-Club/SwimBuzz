import { Course, Prisma } from "@prisma/client"
import { parseMeetDate } from "@/lib/swim-parse"
import { parseSeason, seasonFromDate } from "@/lib/season"
import {
  normalizeFinalsHeatSheetUrls,
  normalizeHeatSheetUrls,
} from "@/lib/meet-files"
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@swimbuzz/shared"

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

const MEET_JSON_KEYS = [
  "heatSheetUrls",
  "finalsHeatSheetUrls",
  "eventOrder",
  "photos",
  "psychSheetSummary",
  "heatSheetSummary",
  "finalsHeatSheetSummary",
  "entriesSheetSummary",
  "relayResultsSummary",
  "resultStatusesSummary",
] as const

/**
 * Prisma JSON columns reject JavaScript `null`. Convert those clears to DbNull
 * at the write boundary so resource toggles (empty packet URL, no heat sheets)
 * persist as SQL NULL.
 */
export function toPrismaMeetWriteData<T extends Record<string, unknown>>(data: T): T {
  const next: Record<string, unknown> = { ...data }
  for (const key of MEET_JSON_KEYS) {
    if (key in next && next[key] === null) {
      next[key] = Prisma.DbNull
    }
  }
  return next as T
}

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

  const startForCompare =
    data.startDate instanceof Date
      ? (data.startDate as Date)
      : "startDate" in body
        ? parseMeetDate(String(body.startDate ?? ""))
        : null
  const endForCompare = data.endDate instanceof Date ? (data.endDate as Date) : null
  if (startForCompare && endForCompare && endForCompare.getTime() < startForCompare.getTime()) {
    throw new MeetInputError("End date must be on or after the start date")
  }

  if ("startTime" in body) {
    const raw = optionalString(body.startTime)
    if (raw) {
      // Accept HH:MM or HH:MM:SS from <input type="time">
      const match = raw.match(/^(\d{2}:\d{2})(?::\d{2})?$/)
      if (!match) throw new MeetInputError("Start time must be HH:MM")
      data.startTime = match[1]
    } else {
      data.startTime = null
    }
  }

  if ("timeZone" in body) {
    const raw = optionalString(body.timeZone)
    if (raw && !isValidTimeZone(raw)) throw new MeetInputError("Time zone is invalid")
    data.timeZone = raw ?? DEFAULT_TIME_ZONE
  } else if (opts.requireStartDate) {
    data.timeZone = DEFAULT_TIME_ZONE
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
    const team = String(body.teamCode ?? "").trim()
    if (!team) throw new MeetInputError("Team code is required")
    data.teamCode = team
  }

  if ("location" in body) data.location = optionalString(body.location)
  if ("school" in body) data.school = optionalString(body.school)
  if ("iconUrl" in body) data.iconUrl = optionalString(body.iconUrl)
  if ("bannerUrl" in body) data.bannerUrl = optionalString(body.bannerUrl)
  if ("packetUrl" in body) data.packetUrl = optionalString(body.packetUrl)
  if ("psychSheetUrl" in body) data.psychSheetUrl = optionalString(body.psychSheetUrl)
  if ("heatSheetUrl" in body) data.heatSheetUrl = optionalString(body.heatSheetUrl)
  if ("heatSheetUrls" in body) {
    const links = normalizeHeatSheetUrls(body.heatSheetUrls)
    data.heatSheetUrls = links
    // Preserve legacy consumers by mirroring the first current heat sheet URL.
    data.heatSheetUrl = links?.[0]?.url ?? null
  }
  if ("finalsHeatSheetUrls" in body) {
    data.finalsHeatSheetUrls = normalizeFinalsHeatSheetUrls(body.finalsHeatSheetUrls)
  }
  if ("entriesSheetUrl" in body) data.entriesSheetUrl = optionalString(body.entriesSheetUrl)
  if ("resultsUrl" in body) data.resultsUrl = optionalString(body.resultsUrl)
  if ("swimphoneUrl" in body) data.swimphoneUrl = optionalString(body.swimphoneUrl)
  if ("liveStreamUrl" in body) data.liveStreamUrl = optionalString(body.liveStreamUrl)
  if ("rideSignUpsUrl" in body) data.rideSignUpsUrl = optionalString(body.rideSignUpsUrl)
  if ("roomsUrl" in body) data.roomsUrl = optionalString(body.roomsUrl)
  if ("hotel" in body) data.hotel = optionalString(body.hotel)
  if ("packingList" in body) data.packingList = optionalString(body.packingList)
  if ("itinerary" in body) data.itinerary = optionalString(body.itinerary)
  if ("photos" in body) {
    const photos = body.photos
    if (photos === null || photos === undefined) {
      data.photos = null
    } else if (Array.isArray(photos)) {
      data.photos = photos.filter((p: any) => p && p.url && p.url.trim()).slice(0, 15)
    } else if (typeof photos === "object") {
      const links = (photos as any).links
      const previews = (photos as any).previews
      const validatedLinks = Array.isArray(links)
        ? links.filter((p: any) => p && p.url && p.url.trim()).slice(0, 15)
        : []
      const validatedPreviews = Array.isArray(previews)
        ? previews.filter((url: any) => url && typeof url === "string" && url.trim()).slice(0, 20)
        : []
      data.photos = { links: validatedLinks, previews: validatedPreviews }
    } else {
      throw new MeetInputError("Photos must be an array or an object")
    }
  }

  return data
}

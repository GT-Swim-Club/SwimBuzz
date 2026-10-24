import type { Course } from "@prisma/client"
import { parseMeetDate } from "@/lib/swim/swim-parse"
import { normalizeTags } from "@/lib/practice/practice-tags"
import { sanitizePracticeHtml } from "@/lib/sanitize-html"
import { parseCourse } from "@/lib/course"
import { DEFAULT_TIME_ZONE, isValidTimeZone, zonedTimeToUtc } from "@swimbuzz/shared"

export class PracticeInputError extends Error {}
export const MAX_PRACTICE_SETS = 10
export const MAX_PRACTICE_TITLE_LENGTH = 120
/** Sanitized HTML across focus + every set's content. Real practices run well under 1,000. */
export const MAX_PRACTICE_CONTENT_LENGTH = 20_000

export type NormalizedSet = {
  id?: string
  order: number
  startsNewRow: boolean
  title: string | null
  content: string
  distance: number | null
}

export const practiceSetSelect = {
  id: true,
  order: true,
  startsNewRow: true,
  title: true,
  content: true,
  distance: true,
} as const

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function parseClockTime(value: string): string | null {
  const normalized = value.trim().toUpperCase()
  const canonical = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(normalized)
  const twelveHour = /^(\d{1,2}):(\d{2})\s*(AM|PM)/.exec(normalized)
  let hour: number
  let minute: number
  if (twelveHour && twelveHour[0] === normalized) {
    const rawHour = Number(twelveHour[1])
    minute = Number(twelveHour[2])
    if (rawHour < 1 || rawHour > 12 || minute > 59) return null
    hour = rawHour % 12 + (twelveHour[3] === "PM" ? 12 : 0)
  } else if (canonical && canonical[0] === normalized) {
    hour = Number(canonical[1])
    minute = Number(canonical[2])
    if (hour > 23 || minute > 59) return null
  } else {
    return null
  }

  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0")
}

function clockToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function normalizeSet(raw: unknown, index: number): NormalizedSet {
  const s = (raw ?? {}) as Record<string, unknown>
  const content = sanitizePracticeHtml(String(s.content ?? "").trim())

  let distance: number | null = null
  if (s.distance !== undefined && s.distance !== null && String(s.distance).trim() !== "") {
    const parsed = parseInt(String(s.distance), 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new PracticeInputError(`Set ${index + 1} has an invalid distance`)
    }
    distance = parsed
  }

  const title = optionalString(s.title)
  if (title && title.length > MAX_PRACTICE_TITLE_LENGTH) {
    throw new PracticeInputError(
      `Set ${index + 1} title must be ${MAX_PRACTICE_TITLE_LENGTH} characters or fewer`
    )
  }

  const id = optionalString(s.id)
  // The first set trivially starts its own row regardless of what's sent.
  const startsNewRow = index === 0 || s.startsNewRow !== false
  return {
    ...(id ? { id } : {}),
    order: index,
    startsNewRow,
    title,
    content,
    distance,
  }
}

export type NormalizedPractice = {
  title: string
  startsAt: Date
  endsAt: Date
  timeZone: string
  location: string
  course: Course
  focus: string | null
  tags: string[]
  published: boolean
  sets: NormalizedSet[]
}

/**
 * Validate and normalize practice form input (including its nested sets).
 * `requireSets` guards creation; edits may temporarily send fewer.
 * `requireTimes` is for private practices, which don't get the team's default time slot.
 */
export function buildPracticeData(
  body: Record<string, unknown>,
  opts: { requireSets?: boolean; requireTimes?: boolean } = {}
): NormalizedPractice {
  const title = String(body.title ?? "").trim() || "Untitled Practice"
  if (title.length > MAX_PRACTICE_TITLE_LENGTH) {
    throw new PracticeInputError(`Title must be ${MAX_PRACTICE_TITLE_LENGTH} characters or fewer`)
  }

  const rawDate = optionalString(body.date)
  if (!rawDate) throw new PracticeInputError("Practice date is required")
  const parsedDate = parseMeetDate(rawDate)
  if (!parsedDate) throw new PracticeInputError("Practice date is invalid")
  const dayKey = parsedDate.toISOString().slice(0, 10)

  const rawSets = Array.isArray(body.sets) ? body.sets : []
  if (rawSets.length > MAX_PRACTICE_SETS) {
    throw new PracticeInputError(`A practice can have at most ${MAX_PRACTICE_SETS} sets`)
  }
  const sets = rawSets.map((s, i) => normalizeSet(s, i))
  if (opts.requireSets && sets.length === 0) {
    throw new PracticeInputError("Add at least one set to the practice")
  }

  const published = body.published === true

  const rawStartTime = optionalString(body.startTime)
  const rawEndTime = optionalString(body.endTime)
  if (opts.requireTimes && (!rawStartTime || !rawEndTime)) {
    throw new PracticeInputError("Pick a start and end time")
  }
  const startTime = parseClockTime(rawStartTime ?? "19:30")
  if (!startTime) throw new PracticeInputError("Start time must be HH:MM")
  const endTime = parseClockTime(rawEndTime ?? "21:00")
  if (!endTime) throw new PracticeInputError("End time must be HH:MM")

  const startMinutes = clockToMinutes(startTime)
  const endMinutes = clockToMinutes(endTime)
  if (startMinutes != null && endMinutes != null && endMinutes < startMinutes) {
    throw new PracticeInputError("End time must be after start time")
  }

  const rawTimeZone = optionalString(body.timeZone)
  if (rawTimeZone && !isValidTimeZone(rawTimeZone)) {
    throw new PracticeInputError("Time zone is invalid")
  }
  const timeZone = rawTimeZone ?? DEFAULT_TIME_ZONE

  const startsAt = zonedTimeToUtc(dayKey, startTime, timeZone)
  const endsAt = zonedTimeToUtc(dayKey, endTime, timeZone)

  const location = optionalString(body.location) ?? "CRC Comp Pool"
  if (location.length > MAX_PRACTICE_TITLE_LENGTH) {
    throw new PracticeInputError(`Location must be ${MAX_PRACTICE_TITLE_LENGTH} characters or fewer`)
  }

  const rawFocus = optionalString(body.focus)
  const focus = rawFocus ? sanitizePracticeHtml(rawFocus) || null : null
  const contentLength = sets.reduce((sum, s) => sum + s.content.length, focus?.length ?? 0)
  if (contentLength > MAX_PRACTICE_CONTENT_LENGTH) {
    throw new PracticeInputError(
      "This practice is too long to save. Shorten or remove some sets and try again."
    )
  }

  return {
    title,
    startsAt,
    endsAt,
    timeZone,
    location,
    course: parseCourse(body.course),
    focus,
    tags: normalizeTags(body.tags),
    published,
    sets,
  }
}

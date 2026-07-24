import { parseMeetDate } from "@/lib/swim-parse"
import { normalizeTags } from "@/lib/practice-tags"

export class PracticeInputError extends Error {}

export type NormalizedSet = {
  id?: string
  order: number
  title: string | null
  content: string
  notes: string | null
  distance: number | null
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function normalizeSet(raw: unknown, index: number): NormalizedSet {
  const s = (raw ?? {}) as Record<string, unknown>
  const content = String(s.content ?? "").trim()
  if (!content) {
    throw new PracticeInputError(`Set ${index + 1} is missing its workout content`)
  }

  let distance: number | null = null
  if (s.distance !== undefined && s.distance !== null && String(s.distance).trim() !== "") {
    const parsed = parseInt(String(s.distance), 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new PracticeInputError(`Set ${index + 1} has an invalid distance`)
    }
    distance = parsed
  }

  const id = optionalString(s.id)
  return {
    ...(id ? { id } : {}),
    order: index,
    title: optionalString(s.title),
    content,
    notes: optionalString(s.notes),
    distance,
  }
}

export type NormalizedPractice = {
  title: string
  date: Date | null
  startTime: string
  endTime: string
  location: string
  focus: string | null
  tags: string[]
  published: boolean
  sets: NormalizedSet[]
}

/**
 * Validate and normalize practice form input (including its nested sets).
 * `requireSets` guards creation; edits may temporarily send fewer.
 */
export function buildPracticeData(
  body: Record<string, unknown>,
  opts: { requireSets?: boolean } = {}
): NormalizedPractice {
  const title = String(body.title ?? "").trim()
  if (!title) throw new PracticeInputError("Practice title is required")

  let date: Date | null = null
  const rawDate = optionalString(body.date)
  if (rawDate) {
    const parsed = parseMeetDate(rawDate)
    if (!parsed) throw new PracticeInputError("Practice date is invalid")
    date = parsed
  }

  const rawSets = Array.isArray(body.sets) ? body.sets : []
  const sets = rawSets.map((s, i) => normalizeSet(s, i))
  if (opts.requireSets && sets.length === 0) {
    throw new PracticeInputError("Add at least one set to the practice")
  }

  const published = body.published === true

  return {
    title,
    date,
    startTime: optionalString(body.startTime) ?? "19:30",
    endTime: optionalString(body.endTime) ?? "21:00",
    location: optionalString(body.location) ?? "CRC Comp Pool",
    focus: optionalString(body.focus),
    tags: normalizeTags(body.tags),
    published,
    sets,
  }
}

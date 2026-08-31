import { normalizeTag } from "@/lib/practice-tags"

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export const MONTH_SHORT_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export const WEEKDAY_FULL_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]

export type PracticeRailItem = {
  id: string
  slug: string | null
  title: string
  published: boolean
  tags: string[]
  totalDistance: number
  dayKey: string
  startsAt: string
  timeZone: string
  location: string
  /** Lowercased title/focus/set text, precomputed server-side for client-side search filtering. */
  searchText: string
}

export function addUtcDays(date: Date, days: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)
  )
}

export function startOfUtcWeek(date: Date) {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  return addUtcDays(day, -day.getUTCDay())
}

export function formatDayParam(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`
}

export function parseWeekStart(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return startOfUtcWeek(new Date(Date.UTC(year, month - 1, day)))
}

export function parseTags(tag?: string | string[]): string[] {
  const parts = Array.isArray(tag) ? tag : tag ? [tag] : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    for (const raw of part.split(",")) {
      const value = normalizeTag(raw)
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(value)
    }
  }
  return out
}

/** Builds an href under `pathname` (either /practices or /practices/<slug>) preserving tags. */
export function buildWorkspaceHref(pathname: string, next: { tags?: string[] } = {}) {
  const params = new URLSearchParams()
  for (const t of next.tags ?? []) params.append("tag", t)
  const s = params.toString()
  return s ? `${pathname}?${s}` : pathname
}

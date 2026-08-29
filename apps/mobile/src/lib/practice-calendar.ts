import { utcDayKey, zonedDayKey } from "@swimbuzz/shared"

export { utcDayKey }

export function todayUtcKey() {
  return utcDayKey(new Date())
}

export function parseUtcDate(value?: string | null): Date | null {
  if (!value) return null
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  )
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

export function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

export function formatMonthLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function formatWeekLabel(weekStart: Date) {
  const weekEnd = addUtcDays(weekStart, 6)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const sameYear = weekStart.getUTCFullYear() === weekEnd.getUTCFullYear()
  const sameMonth = sameYear && weekStart.getUTCMonth() === weekEnd.getUTCMonth()
  if (sameMonth) {
    return `${months[weekStart.getUTCMonth()]} ${weekStart.getUTCDate()} – ${weekEnd.getUTCDate()}, ${weekEnd.getUTCFullYear()}`
  }
  if (sameYear) {
    return `${months[weekStart.getUTCMonth()]} ${weekStart.getUTCDate()} – ${months[weekEnd.getUTCMonth()]} ${weekEnd.getUTCDate()}, ${weekEnd.getUTCFullYear()}`
  }
  return `${months[weekStart.getUTCMonth()]} ${weekStart.getUTCDate()}, ${weekStart.getUTCFullYear()} – ${months[weekEnd.getUTCMonth()]} ${weekEnd.getUTCDate()}, ${weekEnd.getUTCFullYear()}`
}

/**
 * The calendar day a practice falls on, in the practice's OWN stored zone — not a
 * shared UTC day. Each practice is grouped by what its zone's wall clock says, so a
 * late-night practice in one zone can land on a different day than a same-instant
 * practice in another.
 */
export function practiceDayKey(practice: { startsAt: string; timeZone: string }) {
  return zonedDayKey(practice.startsAt, practice.timeZone)
}

export function practiceYardage(practice: {
  totalDistance?: number | null
  sets?: Array<{ distance?: number | null }>
}) {
  if (practice.totalDistance != null) return practice.totalDistance
  return (practice.sets ?? []).reduce((sum, set) => sum + (set.distance ?? 0), 0)
}

export function groupPracticesByDay<T extends { startsAt: string; timeZone: string }>(
  practices: T[]
) {
  const map = new Map<string, T[]>()
  for (const practice of practices) {
    const key = practiceDayKey(practice)
    if (!key) continue
    const list = map.get(key)
    if (list) list.push(practice)
    else map.set(key, [practice])
  }
  return map
}

export function monthCells(monthStart: Date) {
  const firstWeekday = monthStart.getUTCDay()
  const daysInMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const count = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  return Array.from({ length: count }, (_, index) => {
    const offset = index - firstWeekday
    return {
      date: addUtcDays(monthStart, offset),
      inMonth: offset >= 0 && offset < daysInMonth,
    }
  })
}

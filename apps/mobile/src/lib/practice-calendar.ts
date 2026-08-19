import { utcDayKey } from "@swimbuzz/shared"

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

export function formatPracticeDate(value?: string | null) {
  const date = parseUtcDate(value)
  if (!date) return "No date"
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function practiceDayKey(practice: { date?: string | null }) {
  const date = parseUtcDate(practice.date)
  return date ? utcDayKey(date) : null
}

export function practiceYardage(practice: {
  sets?: Array<{ distance?: number | null }>
}) {
  return (practice.sets ?? []).reduce((sum, set) => sum + (set.distance ?? 0), 0)
}

export function groupPracticesByDay<T extends { date?: string | null }>(practices: T[]) {
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

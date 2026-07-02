import { Course } from "@prisma/client"
import { parseTime } from "./utils"

export function parseSwimTime(timeStr: string): number | null {
  if (!timeStr) return null
  const cleaned = timeStr.trim().toUpperCase()
  if (!cleaned || ["NT", "NS", "DQ", "DFS", "DNF", "SCR"].includes(cleaned)) {
    return null
  }
  try {
    return Math.round(parseTime(cleaned))
  } catch {
    return null
  }
}

export function parseCourse(event: string, rawCourse: string): Course {
  const upper = (rawCourse ?? "").trim().toUpperCase()
  if (upper === "SCY" || upper === "Y") return Course.SCY
  if (upper === "LCM" || upper === "L") return Course.LCM
  if (upper === "SCM" || upper === "S") return Course.SCM

  if (event.includes("SCY") || event.endsWith(" Y")) return Course.SCY
  if (event.includes("LCM") || event.endsWith(" L")) return Course.LCM
  if (event.includes("SCM") || event.endsWith(" S")) return Course.SCM

  return Course.SCY
}

export function normalizeEventName(event: string): string {
  return event.replace(/\s+(SCY|LCM|SCM|Y|L|S)$/i, "").trim()
}

export function parseMeetDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim()
  if (!trimmed) return null

  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  const date = iso
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed)

  if (isNaN(date.getTime())) return null
  return date
}

const STROKE_ORDER: Record<string, number> = {
  Free: 0,
  Back: 1,
  Breast: 2,
  Fly: 3,
  IM: 4,
}

export const STROKE_LABELS = ["Free", "Back", "Breast", "Fly", "IM"] as const

const COURSE_ORDER: Record<string, number> = {
  SCY: 0,
  SCM: 1,
  LCM: 2,
}

export const COURSE_LABELS = ["SCY", "SCM", "LCM"] as const

export function parseEventParts(event: string): { distance: number; stroke: string } {
  const match = event.trim().match(/^(\d+)\s+(.+)$/)
  if (!match) return { distance: 0, stroke: event.trim() }
  return { distance: parseInt(match[1], 10), stroke: match[2].trim() }
}

export function compareSwimEvents(a: string, b: string): number {
  const pa = parseEventParts(a)
  const pb = parseEventParts(b)

  const strokeCmp =
    (STROKE_ORDER[pa.stroke] ?? 99) - (STROKE_ORDER[pb.stroke] ?? 99)
  if (strokeCmp !== 0) return strokeCmp

  return pa.distance - pb.distance
}

export function compareSwimPb(
  a: { event: string; course: string },
  b: { event: string; course: string }
): number {
  const courseCmp =
    (COURSE_ORDER[a.course] ?? 99) - (COURSE_ORDER[b.course] ?? 99)
  if (courseCmp !== 0) return courseCmp

  return compareSwimEvents(a.event, b.event)
}

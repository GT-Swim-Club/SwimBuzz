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

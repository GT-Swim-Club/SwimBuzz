import { formatClockTimeRange } from "./format"
import { htmlToPlainText, isHtmlEmpty } from "./html"
import { zoneAbbreviation, zonedTimeToUtc } from "./timezone"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "Aug 18, 2026" — fixed format, not locale-dependent. Matches apps/web/src/lib/utils.ts#formatSwimDate.
export function formatPracticeShareDate(dateIso: string): string {
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return ""
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export type PracticeShareSet = {
  title: string | null
  content: string
  distance: number | null
}

export type PracticeShareInput = {
  title: string
  dateIso: string | null
  startTime: string
  endTime: string
  timeZone: string
  location: string
  focus: string | null
  tags: string[]
  sets: PracticeShareSet[]
  totalDistance: number
}

/** Path for a practice, given its slug (preferred) or id. */
export function practiceSharePath(slugOrId: string): string {
  return `/practices/${slugOrId}`
}

/** "2026-08-18-morning-sprint.pdf" — shared by web's PDF export and mobile's PDF/PNG export. */
export function practiceShareFilename(title: string, dateIso: string | null, ext: string): string {
  const datePart = dateIso ? dateIso.slice(0, 10) : "practice"
  const titlePart = title
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${datePart}${titlePart ? `-${titlePart}` : ""}.${ext}`
}

/** Absolute, shareable URL for a practice. */
export function practiceShareUrl(origin: string, slugOrId: string): string {
  return `${origin.replace(/\/$/, "")}${practiceSharePath(slugOrId)}`
}

/**
 * Plain-text rendering of a practice for pasting into GroupMe/iMessage/etc.
 * Shows the practice's own time zone, not the viewer's — shared text is a
 * static snapshot, not a live view (matches PracticeExportCapture on web).
 * Title and date/time are deliberately on separate lines, and there's no
 * link — this is meant to be read standalone, not as a preview for a URL.
 */
export function practiceShareText(input: PracticeShareInput): string {
  const lines: string[] = [input.title]

  const dateText = input.dateIso ? formatPracticeShareDate(input.dateIso) : ""
  const dateForZone = input.dateIso ? input.dateIso.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const hasTime = Boolean(input.startTime || input.endTime)
  const zoneAbbrev = hasTime
    ? zoneAbbreviation(input.timeZone, zonedTimeToUtc(dateForZone, input.startTime || input.endTime, input.timeZone))
    : null
  const timeText = hasTime
    ? `${formatClockTimeRange(input.startTime, input.endTime)}${zoneAbbrev ? ` ${zoneAbbrev}` : ""}`
    : ""
  const dateTimeLine = [dateText, timeText].filter(Boolean).join(" · ")
  if (dateTimeLine) lines.push(dateTimeLine)
  if (input.location) lines.push(input.location)

  const hasFocus = Boolean(input.focus && !isHtmlEmpty(input.focus))
  if (hasFocus) {
    lines.push("", htmlToPlainText(input.focus))
  }

  if (input.tags.length > 0) {
    const tagsLine = input.tags.map((tag) => `#${tag}`).join(" ")
    lines.push(...(hasFocus ? [tagsLine] : ["", tagsLine]))
  }

  for (const set of input.sets) {
    const heading = set.distance != null ? `${set.title || "Set"} (${set.distance.toLocaleString()})` : set.title || "Set"
    lines.push("", heading, htmlToPlainText(set.content))
  }

  if (input.totalDistance > 0) {
    lines.push("", `Total: ${input.totalDistance.toLocaleString()} yards`)
  }

  return lines.join("\n").trim()
}

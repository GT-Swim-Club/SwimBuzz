import { htmlToPlainText, isHtmlEmpty } from "./html"
import { formatZonedInstantRange } from "./timezone"
import { formatPracticeDistance } from "./course"
import { meetFileName } from "./format"

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
  /** False means this set sits side-by-side with the previous one, in the same row. */
  startsNewRow?: boolean
}

/**
 * Groups a practice's sets (already in reading order) into rows for display,
 * where consecutive sets with `startsNewRow: false` are rendered side-by-side.
 * Shared by the web and mobile read-only views and PNG export captures.
 */
export function groupPracticeSetsIntoRows<T extends { startsNewRow?: boolean }>(
  sets: T[]
): T[][] {
  const rows: T[][] = []
  for (const set of sets) {
    if (set.startsNewRow === false && rows.length > 0) {
      rows[rows.length - 1].push(set)
    } else {
      rows.push([set])
    }
  }
  return rows
}

export type PracticeShareInput = {
  title: string
  startsAt: string
  endsAt: string
  timeZone: string
  location: string
  course: string
  focus: string | null
  tags: string[]
  sets: PracticeShareSet[]
  totalDistance: number
}

/** Path for a practice, given its slug (preferred) or id. */
export function practiceSharePath(slugOrId: string): string {
  return `/practices/${slugOrId}`
}

/** "Morning Sprint - Aug 18, 2026.pdf" — shared by web's and mobile's PDF/PNG exports. */
export function practiceShareFilename(title: string, dayKey: string | null, ext: string): string {
  return meetFileName(title.trim() || "Practice", dayKey ? formatPracticeShareDate(dayKey) : "", ext)
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

  // Header rows mirror the practice page: date/time + location, then distance + tags,
  // with emoji standing in for the page's icons.
  const range = formatZonedInstantRange(input.startsAt, input.endsAt, input.timeZone)
  const dateTimeText = range.crossesDay
    ? `${range.dateTime} ${range.abbrev}`
    : `${range.date} · ${range.time} ${range.abbrev}`
  const firstRow = [
    dateTimeText.trim() ? `📅 ${dateTimeText}` : null,
    input.location ? `📍 ${input.location}` : null,
  ].filter(Boolean)
  if (firstRow.length > 0) lines.push(firstRow.join(" "))

  const secondRow = [
    input.totalDistance > 0 ? `🌊 ${formatPracticeDistance(input.totalDistance, input.course)}` : null,
    input.tags.length > 0 ? `🏷️ ${input.tags.join(", ")}` : null,
  ].filter(Boolean)
  if (secondRow.length > 0) lines.push(secondRow.join(" "))

  if (input.focus && !isHtmlEmpty(input.focus)) {
    lines.push("", htmlToPlainText(input.focus))
  }

  for (const set of input.sets) {
    const heading = set.distance != null ? `${set.title || "Set"} (${set.distance})` : set.title || "Set"
    lines.push("", heading, htmlToPlainText(set.content))
  }

  return lines.join("\n").trim()
}

// Unofficial meets (intrasquads and the like). Their times count for PBs, relay building,
// meet highlights and progression, always marked unofficial — but toward team records and
// Top 10s only in the events swum nowhere else (25s), and never toward
// Nationals qualifiers.

/** Individual 25s: the events only swum at unofficial meets. */
export const UNOFFICIAL_COUNTING_EVENTS: readonly string[] = [
  "25 Free",
  "25 Back",
  "25 Breast",
  "25 Fly",
]

/** Whether an unofficial time in this event still counts toward records and Top 10s. */
export function isUnofficialCountingEvent(event: string): boolean {
  return UNOFFICIAL_COUNTING_EVENTS.includes(event)
}

/** Whether a time counts toward team records and Top 10s. */
export function countsForRecords(swim: { event: string; unofficial?: boolean | null }): boolean {
  return !swim.unofficial || isUnofficialCountingEvent(swim.event)
}

/** Marker before an unofficial time ("*22.31"). */
export const UNOFFICIAL_MARK = "*"

/** Tooltip / accessible label for an unofficial time. */
export function unofficialLabel(meetName?: string | null): string {
  const name = meetName?.trim()
  return name ? `Unofficial · ${name}` : "Unofficial"
}

/** A formatted time with the unofficial marker when it applies: "*22.31". */
export function markUnofficial(formatted: string, unofficial?: boolean | null): string {
  return unofficial ? `${UNOFFICIAL_MARK}${formatted}` : formatted
}

/** Footnote for exports that list any unofficial time. */
export const UNOFFICIAL_FOOTNOTE = "* Unofficial time (intrasquad or other unofficial meet)"

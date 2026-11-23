import { formatMeetDateRange } from "./format"

/**
 * A meet's date and place for share headers (relay PDF and PNG, roster summary PDF), like the meet
 * page's header: "Nov 7–8, 2026" and "Morcom Aquatics Center · FSU" (the school after the location).
 */
export type MeetHeaderDetails = {
  date: string
  location: string | null
  /** An unofficial meet (an intrasquad): its headers carry an "Unofficial" pill after the meet name. */
  unofficial: boolean
}

export function meetHeaderDetails(meet: {
  location?: string | null
  school?: string | null
  startsAt: string | Date
  endsAt?: string | Date | null
  timeZone: string
  unofficial: boolean | null | undefined
}): MeetHeaderDetails {
  const place = [meet.location?.trim(), meet.school?.trim()].filter(Boolean).join(" · ")
  return {
    date: formatMeetDateRange(meet.startsAt, meet.endsAt, meet.timeZone),
    location: place || null,
    unofficial: meet.unofficial === true,
  }
}

/**
 * Proportions of the meet share headers (relays PDF and PNG, roster summary PDF), as fractions of
 * the meet name's font size, so each header looks the same at its own scale. Taken from the roster
 * summary PDF's header (a 26px meet name). Gaps are the visible ones, from one row's baseline to the
 * next row's capitals.
 */
export const MEET_HEADER = {
  /** The gold eyebrow above the meet name. */
  eyebrowSize: 11 / 26,
  /** The date & location line under it. */
  detailsSize: 12 / 26,
  gapAboveTitle: 9 / 26,
  gapBelowTitle: 10.25 / 26,
  /** Between the icon and the text. */
  iconGap: 14 / 26,
  /**
   * How far the icon reaches past the rows at each end (the details' descent), since a round logo
   * that only touches a line looks short of it.
   */
  iconOvershoot: (12 * 0.207) / 26,
  /** An unofficial meet's "UNOFFICIAL" pill after the meet name: its caps text. */
  badgeTextSize: 9 / 26,
  /** The pill's height and side padding, and its gap after the meet name. */
  badgeHeight: 17 / 26,
  badgePadX: 7 / 26,
  badgeGap: 10 / 26,
  /** Letter spacing of the pill's caps, as a fraction of its text size (tracking-[0.08em]). */
  badgeTracking: 0.08,
} as const

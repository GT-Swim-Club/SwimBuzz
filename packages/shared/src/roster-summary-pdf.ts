/**
 * Roster summary PDF export. Each client sends the view it is showing (view mode, filters and
 * search already applied) as sections of rows; the server only lays them out, so web and mobile
 * share one renderer without the server re-deriving either client's view.
 */

import { meetFileName } from "./format"

export type RosterSummaryPdfResult =
  | {
      kind: "done"
      time?: string
      /** DQ / NS / … when there's no time. */
      status?: string
      /** Result minus seed, e.g. "-1.23". */
      delta?: string | null
      place?: number
      /** Top-three finals finish — drawn as a medal-tinted place. */
      podium?: boolean
    }
  | { kind: "seed"; seed: string; seedRank?: number }
  /** Plain right-aligned text (roster list: "4 events · Women"). */
  | { kind: "text"; text: string }
  | { kind: "none" }

export type RosterSummaryPdfRow = {
  eventNumber?: number
  label: string
  /**
   * The label spelled out ("200 Medley Relay B" for "200 Medley B"), drawn instead when it fits on
   * the line with the sub — as it does with no heat & lane crowding it.
   */
  fullLabel?: string
  /** Small text right after the label (result tags, badges). */
  sub?: string
  /** Second line: round / team, already filtered by the viewer's row toggles. */
  meta?: string
  /** Heat & lane column, compact ("H2 of 4 · L5"); left out when the viewer hides heat & lane. */
  heatLane?: string
  /** Start time, under the heat & lane in the same column ("11:38 AM"). */
  startTime?: string
  /** Relay legs in order. */
  legs?: string[]
  /** Right-hand column; left out, the row has none (mobile rows are just a title and subtitle). */
  result?: RosterSummaryPdfResult
}

export type RosterSummaryPdfSection = {
  title: string
  eventNumber?: number
  rows: RosterSummaryPdfRow[]
}

export type RosterSummaryPdfRequest = {
  /** The gold heading under the meet name, e.g. "Heats by Athlete · Women". */
  heading?: string
  sections: RosterSummaryPdfSection[]
  /**
   * Let any section continue in the next column or page under a "(cont.)" title (by-event lists),
   * rather than keeping each one that fits in a column whole.
   */
  splitSections?: boolean
}

export const ROSTER_SUMMARY_PDF_LIMITS = {
  sections: 500,
  rows: 5000,
  legs: 8,
  text: 200,
} as const

/**
 * What the roster summary is called for where the meet is: "Entries" until a heat sheet is in,
 * "Heats" once one is, "Results" once results are posted.
 */
export function rosterSummaryTitle({
  hasHeatSheet,
  hasResults,
}: {
  hasHeatSheet: boolean
  hasResults: boolean
}): "Entries" | "Heats" | "Results" {
  if (hasResults) return "Results"
  return hasHeatSheet ? "Heats" : "Entries"
}

/** The heading's view and filters, minus any search: "Heats by Event (Sunday Finals, Women)". */
export function rosterSummaryPdfLabel(request?: RosterSummaryPdfRequest): string {
  const [view, ...filters] = (request?.heading ?? "")
    .split(" · ")
    .filter((part) => part && !part.startsWith("“"))
  return view ? `${view}${filters.length ? ` (${filters.join(", ")})` : ""}` : "Entries"
}

/** "Heats by Event (Women) - CCS Southern Regionals.pdf", "Roster - CCS Southern Regionals.png". */
export function rosterSummaryPdfFilename(
  meetName: string,
  request?: RosterSummaryPdfRequest,
  ext: "pdf" | "png" = "pdf"
): string {
  return meetFileName(rosterSummaryPdfLabel(request), meetName, ext)
}

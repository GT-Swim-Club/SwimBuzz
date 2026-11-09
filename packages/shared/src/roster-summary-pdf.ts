/**
 * Roster summary PDF export. Each client sends the view it is showing (view mode, filters and
 * search already applied) as sections of rows; the server only lays them out, so web and mobile
 * share one renderer without the server re-deriving either client's view.
 */

import { meetFileName } from "./format"
import type { IconName } from "./icons"
import type { MeetHighlights, MeetWin, NewNationalsCut, StatCounter, TopScorer } from "./meet-highlights"

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
      /** No place column: the time runs to the row's edge (the place leads the row instead). */
      placeless?: boolean
    }
  | { kind: "seed"; seed: string; seedRank?: number }
  /** Plain right-aligned text (roster list: "4 events · Women"). */
  /** `strong` sets it like a time (bold, full ink) — a top scorer's points. */
  | { kind: "text"; text: string; strong?: boolean }
  | { kind: "none" }

/** One of an athlete's new Nationals cuts, a line under their name: "100 Free  -0.37  51.02  51.39" (the cut last). */
export type RosterSummaryPdfCut = { event: string; time: string; cut: string; delta: string }

/** One interval split of an individual swim: the time over the stretch ending at `distance`. */
export type RosterSummaryPdfSplit = { distance: number; time: string }

export type RosterSummaryPdfRow = {
  /** A subsection's heading ("Women") between a section's rows — only its label is drawn. */
  subheading?: boolean
  eventNumber?: number
  /** A podium place leading the row in place of a badge ("1st"), medal-tinted like an event's place. */
  place?: number
  label: string
  /**
   * The label spelled out ("200 Medley Relay B" for "200 Medley B"), drawn instead when it fits on
   * the line with the sub — as it does with no heat & lane crowding it.
   */
  fullLabel?: string
  /** The round, right after the label ("Finals") — the PDF and PNG set it in gold caps. */
  round?: string
  /** Small text right after the label and round (result tags, badges). */
  sub?: string
  /** Second line: round / team, already filtered by the viewer's row toggles. */
  meta?: string
  /** Heat & lane column, compact ("H2 of 4 · L5"); left out when the viewer hides heat & lane. */
  heatLane?: string
  /** Start time, under the heat & lane in the same column ("11:38 AM"). */
  startTime?: string
  /** Relay legs in order. */
  legs?: string[]
  /** Each leg's split, drawn beside its name ("" when unknown), in the same order as `legs`. */
  legSplits?: string[]
  /** An individual swim's interval splits, drawn as aligned columns of times under the row. */
  splits?: RosterSummaryPdfSplit[]
  /** An athlete's new Nationals cuts, a line each under their name (the cuts sections only). */
  cuts?: RosterSummaryPdfCut[]
  /** Right-hand column; left out, the row has none (mobile rows are just a title and subtitle). */
  result?: RosterSummaryPdfResult
}

export type RosterSummaryPdfSection = {
  title: string
  /** An event's only round after its title ("Timed Finals"), named once for its rows — in gold caps like a row's. */
  sub?: string
  eventNumber?: number
  /** An icon in the title's badge in place of an event number (a highlights export's sections). */
  icon?: IconName
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
  /**
   * Draw the meet's order of events above the sections (Entries and Heats exports), narrowed to
   * the packet session the view is filtered to, if any. The PDF only — the PNG and text skip it.
   */
  orderOfEvents?: { session?: string }
  /**
   * The meet's highlights (the highlights export): the carousel's counters as tiles under the
   * header, then its top scorers, top performances and new Nationals cuts as sections. The PDF and
   * PNG only — the text skips it.
   */
  highlights?: RosterSummaryHighlights
  /** Shrink the PDF until it fits on one page (the highlights export). */
  fitOnePage?: boolean
}

export type RosterSummaryHighlights = {
  counters: StatCounter[]
  newNationalsCuts: NewNationalsCut[]
  topScorers: TopScorer[]
  wins: MeetWin[]
}

export const ROSTER_SUMMARY_PDF_LIMITS = {
  sections: 500,
  rows: 5000,
  legs: 8,
  /** Every 25 of a 1650. */
  splits: 66,
  text: 200,
  counters: 40,
  newNationalsCuts: 300,
  topScorers: 20,
  wins: 300,
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

/**
 * The highlights card's export (PDF and PNG): the meet's highlights on one page under a
 * "Highlights" heading, without the full standings.
 */
export function meetHighlightsExportRequest(highlights: MeetHighlights): RosterSummaryPdfRequest {
  return {
    heading: "Highlights",
    sections: [],
    fitOnePage: true,
    highlights: {
      counters: highlights.counters,
      newNationalsCuts: highlights.newNationalsCuts ?? [],
      topScorers: highlights.topScorers ?? [],
      wins: highlights.wins ?? [],
    },
  }
}

/**
 * A highlights export's "New Nationals Cuts" section, a Women then a Men subsection: a row per
 * athlete, in the order the cuts come (by last name), with each of their new cuts on a line under it.
 */
export function rosterSummaryCutsSections(request: RosterSummaryPdfRequest): RosterSummaryPdfSection[] {
  const cuts = request.highlights?.newNationalsCuts ?? []
  const rows: RosterSummaryPdfRow[] = []
  for (const [gender, label] of [["F", "Women"], ["M", "Men"]] as const) {
    const byAthlete = new Map<string, { athleteName: string; lines: RosterSummaryPdfCut[] }>()
    for (const cut of cuts) {
      if (cut.gender !== gender) continue
      const key = cut.athleteId ?? cut.athleteName
      const athlete = byAthlete.get(key) ?? { athleteName: cut.athleteName, lines: [] }
      athlete.lines.push({ event: cut.event, time: cut.time, cut: cut.cut, delta: cut.delta })
      byAthlete.set(key, athlete)
    }
    if (byAthlete.size === 0) continue
    rows.push({ label, subheading: true })
    // In the order the cuts come (by last name).
    for (const { athleteName, lines } of byAthlete.values()) rows.push({ label: athleteName, cuts: lines })
  }
  return rows.length > 0 ? [{ title: "New Nationals Cuts", icon: "stopwatch", rows }] : []
}

const GENDER_LABELS = { F: "Women", M: "Men", X: "Mixed" } as const

/** A highlights export's "Top Individual Scorers" section: the top five (and ties), ranked in the badge. */
function topScorersSection(request: RosterSummaryPdfRequest): RosterSummaryPdfSection[] {
  const scorers = request.highlights?.topScorers ?? []
  if (scorers.length === 0) return []
  return [
    {
      title: "Top Individual Scorers",
      icon: "trophy",
      rows: scorers.map((scorer) => ({
        eventNumber: scorer.rank,
        label: scorer.athleteName,
        meta: `${scorer.events} scoring ${scorer.events === 1 ? "event" : "events"}`,
        result: { kind: "text", text: `${scorer.points} pts`, strong: true },
      })),
    },
  ]
}

/**
 * A highlights export's "Top Performances" section: podium finishes, women's and men's together — a
 * swimmer with the event under their name, a relay by its event with its swimmers under it.
 */
function topPerformancesSection(request: RosterSummaryPdfRequest): RosterSummaryPdfSection[] {
  const wins = request.highlights?.wins ?? []
  if (wins.length === 0) return []
  return [
    {
      title: "Top Performances",
      icon: "medal",
      rows: wins.map((win) => {
        // The place leads the row, medal-tinted like an event's place.
        const result: RosterSummaryPdfResult = { kind: "done", time: win.time, delta: win.delta ?? null, placeless: true }
        const event = `${GENDER_LABELS[win.gender]} ${win.event}`
        return win.athleteName
          ? { place: win.place, label: win.athleteName, meta: event, result }
          : { place: win.place, label: event, legs: win.legs?.length ? win.legs : undefined, result }
      }),
    },
  ]
}

/** A highlights export's sections under its tiles: top scorers, top performances, then new Nationals cuts. */
export function rosterSummaryHighlightSections(request: RosterSummaryPdfRequest): RosterSummaryPdfSection[] {
  return [...topScorersSection(request), ...topPerformancesSection(request), ...rosterSummaryCutsSections(request)]
}

/** The sections an image or PDF of the request draws: any highlight sections, then the rest. */
export function rosterSummaryExportSections(request: RosterSummaryPdfRequest): RosterSummaryPdfSection[] {
  return [...rosterSummaryHighlightSections(request), ...request.sections]
}

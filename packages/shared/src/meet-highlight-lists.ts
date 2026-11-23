import type { MeetHighlights, StatCounter } from "./meet-highlights"
import {
  rosterSummaryHighlightSections,
  type RosterSummaryHighlights,
  type RosterSummaryPdfRow,
} from "./roster-summary-pdf"

/** A highlights list a tile opens: the same rows the highlights export draws for it. */
export type HighlightListKey = "topScorers" | "wins" | "records" | "cuts"

export type HighlightList = {
  key: HighlightListKey
  /** A short tab label ("Places"). */
  tab: string
  /** The export section's title ("Top Performances"). */
  title: string
  rows: RosterSummaryPdfRow[]
}

const LIST_TABS: Record<HighlightListKey, string> = {
  topScorers: "Scorers",
  wins: "Places",
  records: "Records",
  cuts: "Cuts",
}

/** The list a highlight tile opens, if any: top scorers, wins / podiums, GTSC records, new cuts. */
export function highlightCounterList(counter: StatCounter): HighlightListKey | null {
  if (counter.page === "topScorers") return "topScorers"
  if (counter.page) return null
  const label = counter.label.trim().toLowerCase()
  if (/^(wins?|podiums?)$/.test(label)) return "wins"
  if (/^gtsc records?$/.test(label)) return "records"
  if (/^new nattys cuts?$/.test(label)) return "cuts"
  return null
}

/**
 * The highlights' lists in the export's order, each with the rows its export section draws — the
 * export's own section builder fed one list at a time, so the two never drift apart. Lists with no
 * rows are left out.
 */
export function highlightLists(
  highlights: Pick<MeetHighlights, "topScorers" | "wins" | "records" | "newNationalsCuts">
): HighlightList[] {
  const none: RosterSummaryHighlights = { counters: [], newNationalsCuts: [], topScorers: [], wins: [], records: [] }
  const only: Record<HighlightListKey, Partial<RosterSummaryHighlights>> = {
    topScorers: { topScorers: highlights.topScorers ?? [] },
    wins: { wins: highlights.wins ?? [] },
    records: { records: highlights.records ?? [] },
    cuts: { newNationalsCuts: highlights.newNationalsCuts ?? [] },
  }
  const lists: HighlightList[] = []
  for (const key of ["topScorers", "wins", "records", "cuts"] as const) {
    const [section] = rosterSummaryHighlightSections({ sections: [], highlights: { ...none, ...only[key] } })
    if (section && section.rows.length > 0) {
      lists.push({ key, tab: LIST_TABS[key], title: section.title, rows: section.rows })
    }
  }
  return lists
}

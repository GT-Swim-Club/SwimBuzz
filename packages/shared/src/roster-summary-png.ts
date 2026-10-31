/**
 * Roster summary PNG export: the same request as the PDF, drawn by each client (html-to-image on
 * web, react-native-view-shot on mobile) as one image with its sections in balanced columns.
 */

import type { RosterSummaryPdfRow, RosterSummaryPdfSection } from "./roster-summary-pdf"

/** About how many rows' height a column holds before another column is added. */
const ROWS_PER_COLUMN = 18
const MAX_COLUMNS = 3

/** A row's height in label lines: the label, then a line each for meta / start time and per two legs. */
function rowWeight(row: RosterSummaryPdfRow): number {
  const below = (row.meta || row.startTime ? 1 : 0) + Math.ceil((row.legs?.length ?? 0) / 2)
  return 1 + below * 0.7
}

function sectionWeight(section: RosterSummaryPdfSection): number {
  // The title row, a little taller than a row.
  return 1.4 + section.rows.reduce((sum, row) => sum + rowWeight(row), 0)
}

/**
 * The sections split, in order, into columns of about equal height: one column for a short list,
 * up to three for a long one. Reading order runs down each column, then across.
 */
export function rosterSummaryPngColumns(sections: RosterSummaryPdfSection[]): RosterSummaryPdfSection[][] {
  if (sections.length === 0) return []
  const weights = sections.map(sectionWeight)
  const total = weights.reduce((a, b) => a + b, 0)
  const count = Math.max(1, Math.min(MAX_COLUMNS, sections.length, Math.ceil(total / ROWS_PER_COLUMN)))
  const target = total / count
  const columns: RosterSummaryPdfSection[][] = [[]]
  let used = 0
  sections.forEach((section, i) => {
    const column = columns[columns.length - 1]
    // Start the next column when this section would overshoot the target by more than half of it.
    if (column.length > 0 && columns.length < count && used + weights[i] / 2 > target) {
      columns.push([section])
      used = weights[i]
      return
    }
    column.push(section)
    used += weights[i]
  })
  return columns
}

/**
 * Roster summary PNG export: the same request as the PDF, drawn by each client (html-to-image on
 * web, react-native-view-shot on mobile) as one image with its sections in balanced columns.
 */

import { highlightTileRows } from "./meet-highlights"
import {
  rosterSummaryExportSections,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfRow,
  type RosterSummaryPdfSection,
} from "./roster-summary-pdf"

const MAX_COLUMNS = 3
/** A column's width, and the meet header plus padding's height, in row heights (as drawn). */
const COLUMN_WIDTH_ROWS = 20
const HEADER_ROWS = 5.5
/** Each row of highlight tiles, in row heights. */
const HIGHLIGHT_TILE_ROWS = 2.2

/**
 * A row's height in label lines: the label, then a line each for meta / start time, per two legs
 * and per new Nationals cut.
 */
function rowWeight(row: RosterSummaryPdfRow): number {
  if (row.subheading) return 0.9
  const below =
    (row.meta || row.startTime ? 1 : 0) + Math.ceil((row.legs?.length ?? 0) / 2) + (row.cuts?.length ?? 0)
  return 1 + below * 0.7
}

function sectionWeight(section: RosterSummaryPdfSection): number {
  // The title row, a little taller than a row.
  return 1.4 + section.rows.reduce((sum, row) => sum + rowWeight(row), 0)
}

/** How many columns make the image closest to square — never a wide strip of short columns. */
function columnCount(total: number, sections: number, headerRows: number): number {
  let best = 1
  let bestDistance = Infinity
  for (let count = 1; count <= Math.min(MAX_COLUMNS, sections); count++) {
    const aspect = (count * COLUMN_WIDTH_ROWS) / (headerRows + total / count)
    const distance = Math.abs(Math.log(aspect))
    if (distance < bestDistance) {
      best = count
      bestDistance = distance
    }
  }
  return best
}

/**
 * The request's sections (new Nationals cuts first) split, in order, into columns of about equal
 * height, as many (up to three) as keep the image about square, highlights included. Reading order
 * runs down each column, then across.
 */
export function rosterSummaryPngColumns(request: RosterSummaryPdfRequest): RosterSummaryPdfSection[][] {
  const sections = rosterSummaryExportSections(request)
  if (sections.length === 0) return []
  const tileRows = highlightTileRows(request.highlights?.counters ?? []).length
  const headerRows = HEADER_ROWS + tileRows * HIGHLIGHT_TILE_ROWS
  const weights = sections.map(sectionWeight)
  const total = weights.reduce((a, b) => a + b, 0)
  const count = columnCount(total, sections.length, headerRows)
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

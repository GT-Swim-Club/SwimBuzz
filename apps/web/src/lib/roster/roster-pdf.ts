import { jsPDF } from "jspdf"
import { MEET_HEADER } from "@swimbuzz/shared"
import { HELVETICA_CAP_HEIGHT } from "@/lib/meet/meet-pdf-details"
import { pdfText } from "@/lib/meet/roster-summary-pdf"

const EYEBROW = "Georgia Tech Swim Club"

type RGB = [number, number, number]

export type RosterPdfCell = { text: string }

export type RosterPdfColumn = {
  label: string
  /** Fixed width in pt; the first column takes whatever's left. */
  width?: number
  align?: "left" | "center"
}

export type RosterPdfInput = {
  /** "2026–2027 Roster" */
  title: string
  /** "Men · 42 athletes · No physical" */
  details: string
  columns: RosterPdfColumn[]
  /** One row per athlete, a cell per column. */
  rows: RosterPdfCell[][]
  /** Shown instead of the table when there are no rows. */
  emptyMessage: string
}

// Light-theme brand tokens (variables.css); the PDF is always printed on white.
const ACCENT: RGB = [140, 107, 56]
const INK: RGB = [31, 31, 31]
const INK_SECONDARY: RGB = [89, 89, 89]
const INK_TERTIARY: RGB = [140, 140, 140]
const BORDER: RGB = [234, 234, 234]
const HEADER_BG: RGB = [246, 246, 246]
/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

const TITLE_SIZE = px(26)

const M = {
  margin: px(40),
  titleSize: TITLE_SIZE,
  eyebrowSize: TITLE_SIZE * MEET_HEADER.eyebrowSize,
  eyebrowCharSpace: px(1.5),
  detailsSize: px(15),
  titleGapAbove: TITLE_SIZE * MEET_HEADER.gapAboveTitle,
  titleGapBelow: TITLE_SIZE * MEET_HEADER.gapBelowTitle,
  headerGap: px(20),
  headRowHeight: px(28),
  headSize: px(10),
  headCharSpace: px(0.6),
  rowHeight: px(22),
  textSize: px(11.5),
  cellPadX: px(8),
  radius: px(6),
  footerSize: px(10),
  /** Space between the two tables. */
  gutter: px(24),
}

/**
 * The roster as a Letter PDF in two side-by-side tables per page, each with its own column header
 * band. Rows run down the left table, then the right, so the list reads A–Z down each one; the
 * last page splits what's left evenly between the two.
 */
export function buildRosterPdf(input: RosterPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = M.margin
  const right = pageWidth - M.margin
  const contentBottom = pageHeight - M.margin
  const footerBaseline = pageHeight - px(20)

  doc.setProperties({ title: `${input.title} - ${EYEBROW}`, author: "SwimBuzz", creator: "SwimBuzz" })

  function setType(style: "normal" | "bold", size: number, color: RGB = INK) {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }

  /** Text cut to `maxWidth` with an ellipsis, in the current font. */
  function fit(raw: string, maxWidth: number, charSpace = 0): string {
    const text = pdfText(raw)
    const width = (value: string) => doc.getTextWidth(value) + Math.max(0, value.length - 1) * charSpace
    if (width(text) <= maxWidth) return text
    let cut = text
    while (cut.length > 0 && width(`${cut}…`) > maxWidth) cut = cut.slice(0, -1)
    return `${cut.trimEnd()}…`
  }

  const baselineIn = (top: number, height: number, size: number) => top + height / 2 + size * 0.35

  // ---- columns: two tables; in each, fixed widths and the first (athlete) takes the rest ----

  const tableWidth = (right - left - M.gutter) / 2
  const tableLefts = [left, left + tableWidth + M.gutter]
  const fixed = input.columns.slice(1).reduce((sum, c) => sum + (c.width ?? 0), 0)
  const widths = input.columns.map((c, i) => (i === 0 ? tableWidth - fixed : (c.width ?? 0)))
  /** Each column's x within a table. */
  const offsets = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0))

  // ---- header (first page only) ----

  setType("bold", M.eyebrowSize, ACCENT)
  let baseline = M.margin + M.eyebrowSize * HELVETICA_CAP_HEIGHT
  doc.text(EYEBROW.toUpperCase(), left, baseline, { charSpace: M.eyebrowCharSpace })
  setType("bold", M.titleSize)
  baseline += M.titleGapAbove + M.titleSize * HELVETICA_CAP_HEIGHT
  doc.text(fit(input.title, right - left), left, baseline)
  setType("normal", M.detailsSize, INK_SECONDARY)
  baseline += M.titleGapBelow + M.detailsSize * HELVETICA_CAP_HEIGHT
  doc.text(fit(input.details, right - left), left, baseline)
  let top = baseline + M.headerGap

  if (input.rows.length === 0) {
    setType("normal", M.textSize, INK_SECONDARY)
    doc.text(fit(input.emptyMessage, right - left), left, top + M.textSize)
    drawFooters()
    return doc
  }

  function cellX(tableLeft: number, i: number, text: string, charSpace = 0) {
    const x = tableLeft + offsets[i]
    if (input.columns[i].align !== "center") return x + M.cellPadX
    const width = doc.getTextWidth(text) + Math.max(0, text.length - 1) * charSpace
    return x + widths[i] / 2 - width / 2
  }

  /** One table: its header band, then `rows` from `y`. */
  function drawTable(tableLeft: number, y: number, rows: RosterPdfCell[][]) {
    doc.setFillColor(...HEADER_BG)
    doc.roundedRect(tableLeft, y, tableWidth, M.headRowHeight, M.radius, M.radius, "F")
    setType("bold", M.headSize, INK_SECONDARY)
    const headAt = baselineIn(y, M.headRowHeight, M.headSize)
    input.columns.forEach((column, i) => {
      const text = fit(column.label.toUpperCase(), widths[i] - M.cellPadX * 2, M.headCharSpace)
      doc.text(text, cellX(tableLeft, i, text, M.headCharSpace), headAt, { charSpace: M.headCharSpace })
    })
    y += M.headRowHeight

    rows.forEach((row, index) => {
      const at = baselineIn(y, M.rowHeight, M.textSize)
      row.forEach((cell, i) => {
        if (i === 0) setType("bold", M.textSize)
        else setType("normal", M.textSize, INK_SECONDARY)
        const text = fit(cell.text, widths[i] - M.cellPadX * 2)
        doc.text(text, cellX(tableLeft, i, text), at)
      })
      y += M.rowHeight
      if (index < rows.length - 1) {
        doc.setLineWidth(0.5)
        doc.setDrawColor(...BORDER)
        doc.line(tableLeft + M.cellPadX, y, tableLeft + tableWidth - M.cellPadX, y)
      }
    })
  }

  let next = 0
  for (;;) {
    const perTable = Math.max(1, Math.floor((contentBottom - top - M.headRowHeight) / M.rowHeight))
    const remaining = input.rows.length - next
    // A full page fills the left table first; the last page splits what's left evenly.
    const leftCount = remaining >= perTable * 2 ? perTable : Math.ceil(remaining / 2)
    const rightCount = Math.min(perTable, remaining - leftCount)
    drawTable(tableLefts[0], top, input.rows.slice(next, next + leftCount))
    if (rightCount > 0) drawTable(tableLefts[1], top, input.rows.slice(next + leftCount, next + leftCount + rightCount))
    next += leftCount + rightCount
    if (next >= input.rows.length) break
    doc.addPage()
    top = M.margin
  }

  drawFooters()
  return doc

  function drawFooters() {
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page)
      setType("normal", M.footerSize, INK_TERTIARY)
      doc.text(fit(`${input.title} · ${input.details}`, right - left - px(80)), left, footerBaseline)
      doc.text(`${page} / ${pages}`, right, footerBaseline, { align: "right" })
    }
  }
}

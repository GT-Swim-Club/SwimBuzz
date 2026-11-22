import { jsPDF } from "jspdf"
import { MEET_HEADER } from "@swimbuzz/shared"
import { HELVETICA_CAP_HEIGHT } from "@/lib/meet/meet-pdf-details"
import { pdfText } from "@/lib/meet/roster-summary-pdf"

const EYEBROW = "Georgia Tech Swim Club"

type RGB = [number, number, number]

/** complete = green, partial = yellow, missing = red — like the status icons. */
export type RosterPdfTone = "complete" | "partial" | "missing"

export type RosterPdfCell = { text: string; tone?: RosterPdfTone }

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
const TONE: Record<RosterPdfTone, RGB> = {
  complete: [21, 128, 61], // --brand-color-success-text
  partial: [180, 83, 9], // --brand-color-warning-text
  missing: [220, 38, 38], // --brand-color-error
}

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
}

/**
 * The roster as a Letter PDF: one table, a row per athlete, with a column header band that repeats
 * on every page. Status cells (clearance, SwimCloud) are colored like the status icons.
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

  // ---- columns: fixed widths, the first (athlete) takes the rest ----

  const fixed = input.columns.slice(1).reduce((sum, c) => sum + (c.width ?? 0), 0)
  const widths = input.columns.map((c, i) => (i === 0 ? right - left - fixed : (c.width ?? 0)))
  const xs = widths.map((_, i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0))

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
  let y = baseline + M.headerGap

  if (input.rows.length === 0) {
    setType("normal", M.textSize, INK_SECONDARY)
    doc.text(fit(input.emptyMessage, right - left), left, y + M.textSize)
    drawFooters()
    return doc
  }

  function cellX(i: number, text: string) {
    if (input.columns[i].align === "center") return xs[i] + widths[i] / 2 - doc.getTextWidth(text) / 2
    return xs[i] + M.cellPadX
  }

  function drawHeadRow() {
    doc.setFillColor(...HEADER_BG)
    doc.roundedRect(left, y, right - left, M.headRowHeight, M.radius, M.radius, "F")
    setType("bold", M.headSize, INK_SECONDARY)
    const at = baselineIn(y, M.headRowHeight, M.headSize)
    input.columns.forEach((column, i) => {
      const text = fit(column.label.toUpperCase(), widths[i] - M.cellPadX * 2, M.headCharSpace)
      const x =
        column.align === "center"
          ? xs[i] + widths[i] / 2 - (doc.getTextWidth(text) + Math.max(0, text.length - 1) * M.headCharSpace) / 2
          : xs[i] + M.cellPadX
      doc.text(text, x, at, { charSpace: M.headCharSpace })
    })
    y += M.headRowHeight
  }

  function drawRow(row: RosterPdfCell[], last: boolean) {
    const at = baselineIn(y, M.rowHeight, M.textSize)
    row.forEach((cell, i) => {
      if (i === 0) setType("bold", M.textSize)
      else setType("normal", M.textSize, cell.tone ? TONE[cell.tone] : INK_SECONDARY)
      const text = fit(cell.text, widths[i] - M.cellPadX * 2)
      doc.text(text, cellX(i, text), at)
    })
    y += M.rowHeight
    if (!last) {
      doc.setLineWidth(0.5)
      doc.setDrawColor(...BORDER)
      doc.line(left + M.cellPadX, y, right - M.cellPadX, y)
    }
  }

  drawHeadRow()
  input.rows.forEach((row, index) => {
    if (y + M.rowHeight > contentBottom) {
      doc.addPage()
      y = M.margin
      drawHeadRow()
    }
    drawRow(row, index === input.rows.length - 1)
  })

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

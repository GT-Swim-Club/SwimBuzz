import { jsPDF } from "jspdf"
import {
  MEET_HEADER,
  RECORDS_EXPORT,
  formatRecordTime,
  recordSwimmerLabel,
  topTimesModeLabel,
  topTimesTitle,
  type TeamAllTopTimesResponse,
  type TeamTopTime,
  type TeamTopTimesEvent,
} from "@swimbuzz/shared"
import { HELVETICA_CAP_HEIGHT } from "@/lib/meet/meet-pdf-details"
import { pdfText } from "@/lib/meet/roster-summary-pdf"

export type TopTimesPdfInput = {
  data: TeamAllTopTimesResponse
  /** "Rev. Nov 22, 2026" */
  asOf: string
}

type RGB = [number, number, number]

// Light-theme brand tokens (variables.css); the PDF is always printed on white.
const ACCENT: RGB = [140, 107, 56]
const INK: RGB = [31, 31, 31]
const INK_SECONDARY: RGB = [89, 89, 89]
const INK_TERTIARY: RGB = [140, 140, 140]
const BORDER: RGB = [234, 234, 234]
/** An event's heading band: --brand-color-fill-secondary at 60% on white, like the page's cards. */
const HEADER_BG: RGB = [246, 246, 246]

/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

const TITLE_SIZE = px(26)

const M = {
  margin: px(40),
  titleSize: TITLE_SIZE,
  eyebrowSize: TITLE_SIZE * MEET_HEADER.eyebrowSize,
  eyebrowCharSpace: px(1.5),
  detailsSize: px(14),
  titleGapAbove: TITLE_SIZE * MEET_HEADER.gapAboveTitle,
  titleGapBelow: TITLE_SIZE * MEET_HEADER.gapBelowTitle,
  headerGap: px(18),
  columnGap: px(16),
  blockGap: px(12),
  bandHeight: px(26),
  bandSize: px(12.5),
  textSize: px(11),
  lineHeight: px(14),
  rowPadY: px(3.5),
  cellPadX: px(8),
  rankWidth: px(26),
  yearWidth: px(38),
  timeWidth: px(56),
  radius: px(6),
  footerSize: px(10),
}

/**
 * Every record event's top 10 for one gender on Letter pages, laid out like the records page's
 * Top 10 view: each event's list as a card, in records-table order (rank, swimmer(s), year, time;
 * this season's swims in bold gold), two cards to a row. A row of cards never splits across pages.
 */
export function buildTopTimesPdf({ data, asOf }: TopTimesPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = M.margin
  const right = pageWidth - M.margin
  const contentBottom = pageHeight - M.margin
  const footerBaseline = pageHeight - px(20)
  const blockWidth = (right - left - M.columnGap) / 2
  const title = topTimesTitle(data.gender)
  const details = `${topTimesModeLabel(data.mode)} · ${asOf}`

  doc.setProperties({ title: `${title} - ${RECORDS_EXPORT.eyebrow}`, author: "SwimBuzz", creator: "SwimBuzz" })

  function setType(style: "normal" | "bold", size: number, color: RGB = INK) {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }

  /** Text cut to `maxWidth` with an ellipsis, in the current font. */
  function fit(raw: string, maxWidth: number): string {
    const text = pdfText(raw)
    if (doc.getTextWidth(text) <= maxWidth) return text
    let cut = text
    while (cut.length > 0 && doc.getTextWidth(`${cut}…`) > maxWidth) cut = cut.slice(0, -1)
    return `${cut.trimEnd()}…`
  }

  const baselineIn = (top: number, height: number, size: number) => top + height / 2 + size * 0.35

  // ---- header (first page only) ----

  setType("bold", M.eyebrowSize, ACCENT)
  let baseline = M.margin + M.eyebrowSize * HELVETICA_CAP_HEIGHT
  doc.text(RECORDS_EXPORT.eyebrow.toUpperCase(), left, baseline, { charSpace: M.eyebrowCharSpace })
  setType("bold", M.titleSize)
  baseline += M.titleGapAbove + M.titleSize * HELVETICA_CAP_HEIGHT
  doc.text(fit(title, right - left), left, baseline)
  setType("normal", M.detailsSize, INK_SECONDARY)
  baseline += M.titleGapBelow + M.detailsSize * HELVETICA_CAP_HEIGHT
  doc.text(fit(details, right - left), left, baseline)
  let y = baseline + M.headerGap

  const rowHeight = (time: TeamTopTime) => Math.max(1, time.swimmers.length) * M.lineHeight + M.rowPadY * 2
  const blockHeight = (event: TeamTopTimesEvent) =>
    M.bandHeight + (event.times.length > 0 ? event.times.reduce((sum, time) => sum + rowHeight(time), 0) : M.lineHeight + M.rowPadY * 2)

  function drawBlock(event: TeamTopTimesEvent, x: number, top: number) {
    const height = blockHeight(event)
    doc.setFillColor(...HEADER_BG)
    doc.roundedRect(x, top, blockWidth, M.bandHeight, M.radius, M.radius, "F")
    doc.rect(x, top + M.bandHeight - M.radius, blockWidth, M.radius, "F")
    setType("bold", M.bandSize)
    doc.text(fit(event.label, blockWidth - M.cellPadX * 2), x + M.cellPadX, baselineIn(top, M.bandHeight, M.bandSize))

    let rowTop = top + M.bandHeight
    doc.setLineWidth(0.75)
    doc.setDrawColor(...BORDER)
    doc.line(x, rowTop, x + blockWidth, rowTop)

    if (event.times.length === 0) {
      setType("normal", M.textSize, INK_TERTIARY)
      doc.text("No swims yet.", x + M.cellPadX, baselineIn(rowTop, M.lineHeight + M.rowPadY * 2, M.textSize))
    }

    const rankRight = x + M.rankWidth
    const nameX = rankRight + M.cellPadX
    const timeRight = x + blockWidth - M.cellPadX
    const yearRight = timeRight - M.timeWidth
    const nameWidth = yearRight - M.yearWidth - nameX
    event.times.forEach((time, index) => {
      const height = rowHeight(time)
      if (index > 0) {
        doc.setLineWidth(0.5)
        doc.setDrawColor(...BORDER)
        doc.line(x + M.cellPadX, rowTop, x + blockWidth - M.cellPadX, rowTop)
      }
      const tied = event.times[index - 1]?.rank === time.rank || event.times[index + 1]?.rank === time.rank
      const firstLine = baselineIn(rowTop + M.rowPadY, M.lineHeight, M.textSize)
      const season = time.isThisSeason
      setType("bold", M.textSize, INK_TERTIARY)
      doc.text(tied ? `T${time.rank}` : String(time.rank), rankRight, firstLine, { align: "right" })
      setType(season ? "bold" : "normal", M.textSize, season ? ACCENT : INK)
      const names = time.swimmers.length > 0 ? time.swimmers.map((s) => recordSwimmerLabel(time, s)) : ["–"]
      names.forEach((name, i) => doc.text(fit(name, nameWidth), nameX, firstLine + i * M.lineHeight))
      setType(season ? "bold" : "normal", M.textSize, season ? ACCENT : INK_SECONDARY)
      doc.text(String(time.year), yearRight, firstLine, { align: "right" })
      setType("bold", M.textSize, season ? ACCENT : INK)
      doc.text(formatRecordTime(time.timeMs), timeRight, firstLine, { align: "right" })
      rowTop += height
    })

    doc.setLineWidth(0.75)
    doc.setDrawColor(...BORDER)
    doc.roundedRect(x, top, blockWidth, height, M.radius, M.radius, "S")
  }

  for (let i = 0; i < data.events.length; i += 2) {
    const pair = data.events.slice(i, i + 2)
    const height = Math.max(...pair.map(blockHeight))
    if (i > 0 && y + height > contentBottom) {
      doc.addPage()
      y = M.margin
    }
    pair.forEach((event, column) => drawBlock(event, left + column * (blockWidth + M.columnGap), y))
    y += height + M.blockGap
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    setType("normal", M.footerSize, INK_TERTIARY)
    doc.text(fit(`${title} · ${details}`, right - left - px(80)), left, footerBaseline)
    doc.text(`${page} / ${pages}`, right, footerBaseline, { align: "right" })
  }
  return doc
}

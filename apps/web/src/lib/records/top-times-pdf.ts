import { jsPDF } from "jspdf"
import {
  MANUAL_RECORD_MARK,
  MEET_HEADER,
  RECORDS_EXPORT,
  formatRecordTime,
  recordSwimmerLabel,
  topTimesEventTitle,
  topTimesSpanLabel,
  topTimesTitle,
  type TeamAllTopTimesResponse,
  type TeamTopTime,
  type TeamTopTimesEvent,
} from "@swimbuzz/shared"
import { HELVETICA_CAP_HEIGHT } from "@/lib/meet/meet-pdf-details"
import { pdfText } from "@/lib/meet/roster-summary-pdf"

export type TopTimesPdfInput = {
  data: TeamAllTopTimesResponse
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
/** This season's rows: the accent gold at 12% on white, behind their bold gold text. */
const SEASON_BG: RGB = [241, 237, 231]

/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

const TITLE_SIZE = px(26)

/** Event cards side by side in each row: relays, with four swimmers a row, get wider cards. */
const COLUMNS = 3
const RELAY_COLUMNS = 2
/** Relay swimmers per line ("Sara Ukic, Rachel Fulton"). */
const RELAY_NAMES_PER_LINE = 2

const M = {
  margin: px(40),
  titleSize: TITLE_SIZE,
  eyebrowSize: TITLE_SIZE * MEET_HEADER.eyebrowSize,
  eyebrowCharSpace: px(1.5),
  detailsSize: px(14),
  titleGapAbove: TITLE_SIZE * MEET_HEADER.gapAboveTitle,
  titleGapBelow: TITLE_SIZE * MEET_HEADER.gapBelowTitle,
  headerGap: px(18),
  columnGap: px(12),
  blockGap: px(10),
  bandHeight: px(22),
  bandSize: px(12.5),
  textSize: px(11),
  lineHeight: px(13),
  rowPadY: px(2.5),
  cellPadX: px(6),
  rankWidth: px(20),
  yearWidth: px(32),
  timeWidth: px(50),
  radius: px(6),
  footerSize: px(10),
  /** This season's row highlight, inset inside the card so it clears the rounded corners. */
  seasonInsetX: px(3),
  seasonInsetY: px(1.5),
  seasonRadius: px(4),
}

/**
 * Every record event's top 10 for one gender on Letter pages, laid out like the records page's
 * Top 10 view: each event's list as a card, in records-table order (rank, swimmer(s), year, time;
 * this season's swims in bold gold on a gold highlight), three cards to a row and rows sized so
 * four rows of full top 10s fit on a page. Relays go two to a row, their swimmers two to a line.
 * A row only holds one kind (individual or relay), and never splits across pages.
 */
export function buildTopTimesPdf({ data }: TopTimesPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = M.margin
  const right = pageWidth - M.margin
  const contentBottom = pageHeight - M.margin
  const footerBaseline = pageHeight - px(20)
  const columnsFor = (event: TeamTopTimesEvent) => (event.relay ? RELAY_COLUMNS : COLUMNS)
  const widthFor = (columns: number) => (right - left - M.columnGap * (columns - 1)) / columns
  const title = topTimesTitle(data.gender, data.mode)
  // "Nov 1, 2017 – Nov 23, 2026": from the earliest imported meet to today.
  const details = topTimesSpanLabel(data.since)

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

  /** A row's swimmer lines: relays pair them up, and a relay with no names known is one "–". */
  function nameLines(event: TeamTopTimesEvent, time: TeamTopTime): string[] {
    const names = time.swimmers.map((s) => recordSwimmerLabel(time, s))
    if (names.length === 0 || names.every((name) => name === "–")) return ["–"]
    if (!event.relay) return names
    const lines: string[] = []
    for (let i = 0; i < names.length; i += RELAY_NAMES_PER_LINE) {
      lines.push(names.slice(i, i + RELAY_NAMES_PER_LINE).join(", "))
    }
    return lines
  }
  const rowHeight = (event: TeamTopTimesEvent, time: TeamTopTime) =>
    nameLines(event, time).length * M.lineHeight + M.rowPadY * 2
  const blockHeight = (event: TeamTopTimesEvent) =>
    M.bandHeight +
    (event.times.length > 0
      ? event.times.reduce((sum, time) => sum + rowHeight(event, time), 0)
      : M.lineHeight + M.rowPadY * 2)

  function drawBlock(event: TeamTopTimesEvent, x: number, top: number, blockWidth: number) {
    const height = blockHeight(event)
    doc.setFillColor(...HEADER_BG)
    doc.roundedRect(x, top, blockWidth, M.bandHeight, M.radius, M.radius, "F")
    doc.rect(x, top + M.bandHeight - M.radius, blockWidth, M.radius, "F")
    setType("bold", M.bandSize)
    doc.text(fit(topTimesEventTitle(event), blockWidth - M.cellPadX * 2), x + M.cellPadX, baselineIn(top, M.bandHeight, M.bandSize))

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
      const height = rowHeight(event, time)
      if (index > 0) {
        doc.setLineWidth(0.5)
        doc.setDrawColor(...BORDER)
        doc.line(x + M.cellPadX, rowTop, x + blockWidth - M.cellPadX, rowTop)
      }
      if (time.isThisSeason) {
        doc.setFillColor(...SEASON_BG)
        doc.roundedRect(
          x + M.seasonInsetX,
          rowTop + M.seasonInsetY,
          blockWidth - M.seasonInsetX * 2,
          height - M.seasonInsetY * 2,
          M.seasonRadius,
          M.seasonRadius,
          "F"
        )
      }
      const tied = event.times[index - 1]?.rank === time.rank || event.times[index + 1]?.rank === time.rank
      const firstLine = baselineIn(rowTop + M.rowPadY, M.lineHeight, M.textSize)
      const season = time.isThisSeason
      setType("bold", M.textSize, INK_TERTIARY)
      doc.text(tied ? `T${time.rank}` : String(time.rank), rankRight, firstLine, { align: "right" })
      setType(season ? "bold" : "normal", M.textSize, season ? ACCENT : INK)
      nameLines(event, time).forEach((name, i) => doc.text(fit(name, nameWidth), nameX, firstLine + i * M.lineHeight))
      setType(season ? "bold" : "normal", M.textSize, season ? ACCENT : INK_SECONDARY)
      doc.text(String(time.year), yearRight, firstLine, { align: "right" })
      setType("bold", M.textSize, season ? ACCENT : INK)
      const timeText = formatRecordTime(time.timeMs)
      doc.text(timeText, timeRight, firstLine, { align: "right" })
      if (time.manual) {
        // The gold "*" hangs off the time's left edge, like on the page.
        doc.setTextColor(...ACCENT)
        doc.text(MANUAL_RECORD_MARK, timeRight - doc.getTextWidth(timeText) - px(1), firstLine, { align: "right" })
      }
      rowTop += height
    })

    doc.setLineWidth(0.75)
    doc.setDrawColor(...BORDER)
    doc.roundedRect(x, top, blockWidth, height, M.radius, M.radius, "S")
  }

  // Rows of consecutive events of one kind: an individual event never shares a row with a relay.
  const rows: TeamTopTimesEvent[][] = []
  for (const event of data.events) {
    const last = rows[rows.length - 1]
    if (last && last.length < columnsFor(last[0]) && columnsFor(last[0]) === columnsFor(event)) last.push(event)
    else rows.push([event])
  }

  rows.forEach((row, i) => {
    const blockWidth = widthFor(columnsFor(row[0]))
    const height = Math.max(...row.map(blockHeight))
    if (i > 0 && y + height > contentBottom) {
      doc.addPage()
      y = M.margin
    }
    row.forEach((event, column) => drawBlock(event, left + column * (blockWidth + M.columnGap), y, blockWidth))
    y += height + M.blockGap
  })

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    setType("normal", M.footerSize, INK_TERTIARY)
    doc.text(fit(`${title} · ${details}`, right - left - px(80)), left, footerBaseline)
    doc.text(`${page} / ${pages}`, right, footerBaseline, { align: "right" })
  }
  return doc
}

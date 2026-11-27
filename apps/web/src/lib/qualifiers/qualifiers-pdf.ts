import { jsPDF } from "jspdf"
import { MEET_HEADER } from "@swimbuzz/shared"
import { HELVETICA_CAP_HEIGHT } from "@/lib/meet/meet-pdf-details"
import { pdfText } from "@/lib/meet/roster-summary-pdf"
import { drawEventOrderTimesPdf } from "@/lib/meet/event-order-pdf"
import type { EventOrderWithHeats } from "@/lib/meet/event-heats"
import type { PlaceTimes } from "@/lib/meet/place-times"

const EYEBROW = "Georgia Tech Swim Club"

export type QualifiersPdfRow = {
  lead: string
  /** The event's number at Nationals, as a gold badge before the lead (an athlete's events). */
  eventNumber?: number | null
  time: string
  margin: string
  meet: string
  date: string
}

/** An event (its swimmers, fastest first) or an athlete (their events). */
export type QualifiersPdfSection = {
  title: string
  /** The event's number at Nationals, as a gold badge before the title (an event's section). */
  eventNumber?: number | null
  meta: string
  rows: QualifiersPdfRow[]
}

export type QualifiersPdfInput = {
  /** "2027 Nationals Qualifiers" */
  title: string
  /** "Women · 12 qualifiers · 19 cuts" */
  details: string
  sections: QualifiersPdfSection[]
  /** Shown instead of the sections when there are none. */
  emptyMessage: string
  /** The Nationals meet's order of events, drawn under the header before the qualifiers. */
  eventOrder?: EventOrderWithHeats | null
  /** Last season's Nationals champion, 8th and 24th place times beside each event, by side. */
  placeTimes?: ((gender: "F" | "M", event: string) => PlaceTimes | null) | null
  /** Where those times are from, over the order of events. */
  placeTimesCaption?: string | null
}

type RGB = [number, number, number]

// Light-theme brand tokens (variables.css); the PDF is always printed on white.
const ACCENT: RGB = [140, 107, 56]
const ACCENT_BORDER: RGB = [203, 188, 165]
const ACCENT_BG: RGB = [244, 240, 235]
const INK: RGB = [31, 31, 31]
const INK_SECONDARY: RGB = [89, 89, 89]
const INK_TERTIARY: RGB = [140, 140, 140]
const BORDER: RGB = [234, 234, 234]
/** --brand-color-success-text: the margin under the cut, green like the page. */
const SUCCESS: RGB = [21, 128, 61]
/** A section's heading band: --brand-color-fill-secondary at 60% on white, like the list header. */
const HEADER_BG: RGB = [246, 246, 246]

/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

const TITLE_SIZE = px(26)

const M = {
  margin: px(40),
  titleSize: TITLE_SIZE,
  eyebrowSize: TITLE_SIZE * MEET_HEADER.eyebrowSize,
  eyebrowCharSpace: px(1.5),
  // A size up from the meet header's details line: here it's the only line under the title.
  detailsSize: px(15),
  titleGapAbove: TITLE_SIZE * MEET_HEADER.gapAboveTitle,
  titleGapBelow: TITLE_SIZE * MEET_HEADER.gapBelowTitle,
  headerGap: px(20),
  sectionGap: px(12),
  sectionHeight: px(28),
  sectionTitleSize: px(13),
  sectionMetaSize: px(11),
  sectionMetaGap: px(10),
  rowHeight: px(22),
  textSize: px(11.5),
  cellPadX: px(8),
  timeWidth: px(72),
  marginWidth: px(80),
  dateWidth: px(96),
  leadMin: px(130),
  leadMax: px(220),
  radius: px(6),
  /** Event number badges, like the roster summary PDF's: a heading's, then a row's. */
  sectionBadgeSize: px(20),
  sectionBadgeTextSize: px(10),
  rowBadgeSize: px(16),
  rowBadgeTextSize: px(8.5),
  badgeGap: px(6),
  footerSize: px(10),
}

/**
 * Nationals qualifiers as a Letter PDF, matching the page's view: a section per event (its
 * qualifiers fastest first) or per athlete (their cuts), each swim's time, margin under the cut,
 * meet and date in columns, unlabeled, after the Nationals order of events when the season has one.
 * Sections run down the pages, and a section that breaks across
 * pages carries its heading over with "(cont.)".
 */
export function buildQualifiersPdf(input: QualifiersPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = M.margin
  const right = pageWidth - M.margin
  const contentBottom = pageHeight - M.margin
  const footerBaseline = pageHeight - px(20)

  doc.setProperties({
    title: `${input.title} - ${EYEBROW}`,
    author: "SwimBuzz",
    creator: "SwimBuzz",
  })

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

  /** A gold event number badge, centered in the band from `top` of `height`; returns its width. */
  function badge(number: number, x: number, top: number, height: number, size: number, textSize: number): number {
    setType("bold", textSize, ACCENT)
    // Two-digit numbers stay circles; three digits stretch into a pill.
    const width = Math.max(size, doc.getTextWidth(String(number)) + px(6))
    const badgeTop = top + (height - size) / 2
    doc.setDrawColor(...ACCENT_BORDER)
    doc.setFillColor(...ACCENT_BG)
    doc.setLineWidth(0.75)
    doc.roundedRect(x, badgeTop, width, size, size / 2, size / 2, "FD")
    doc.text(String(number), x + width / 2, baselineIn(badgeTop, size, textSize), { align: "center" })
    return width
  }

  /** Room a row's badge takes before its lead text. */
  const rowBadgeRoom = (row: QualifiersPdfRow) => (row.eventNumber ? M.rowBadgeSize + M.badgeGap : 0)

  // ---- columns: the lead as wide as its longest entry (within limits), the meet takes the rest ----

  setType("normal", M.textSize)
  const widestLead = Math.max(
    0,
    ...input.sections.flatMap((section) =>
      section.rows.map((row) => doc.getTextWidth(pdfText(row.lead)) + rowBadgeRoom(row))
    )
  )
  const leadWidth = Math.min(M.leadMax, Math.max(M.leadMin, widestLead + M.cellPadX * 2))
  const timeX = left + leadWidth
  const marginX = timeX + M.timeWidth
  const meetX = marginX + M.marginWidth
  const dateX = right - M.dateWidth
  const meetWidth = dateX - meetX

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

  // The Nationals order of events, a session per row with last year's times, before the qualifiers.
  if (input.eventOrder) {
    const bottom = drawEventOrderTimesPdf(doc, input.eventOrder, {
      top: y,
      pageLeft: left,
      pageRight: right,
      contentBottom,
      pageTop: M.margin,
      fit,
      placeTimes: input.placeTimes,
      caption: input.placeTimesCaption,
    })
    if (bottom !== y) y = bottom + M.headerGap
  }

  if (input.sections.length === 0) {
    setType("normal", M.textSize, INK_SECONDARY)
    doc.text(fit(input.emptyMessage, right - left), left, y + M.textSize)
    drawFooters()
    return doc
  }

  function newPage() {
    doc.addPage()
    y = M.margin
  }

  function drawSectionHeading(section: QualifiersPdfSection, continued: boolean) {
    doc.setFillColor(...HEADER_BG)
    doc.roundedRect(left, y, right - left, M.sectionHeight, M.radius, M.radius, "F")
    // The title on the left, its meta ("25.99 · 5 qualifiers") at the band's right edge.
    setType("normal", M.sectionMetaSize, INK_SECONDARY)
    const meta = pdfText(section.meta)
    const metaWidth = doc.getTextWidth(meta)
    doc.text(meta, right - M.cellPadX, baselineIn(y, M.sectionHeight, M.sectionMetaSize), { align: "right" })
    let titleX = left + M.cellPadX
    if (section.eventNumber) {
      titleX +=
        badge(section.eventNumber, titleX, y, M.sectionHeight, M.sectionBadgeSize, M.sectionBadgeTextSize) +
        M.badgeGap
    }
    setType("bold", M.sectionTitleSize)
    const title = fit(
      continued ? `${section.title} (cont.)` : section.title,
      right - titleX - metaWidth - M.sectionMetaGap - M.cellPadX
    )
    doc.text(title, titleX, baselineIn(y, M.sectionHeight, M.sectionTitleSize))
    y += M.sectionHeight
  }

  function drawRow(row: QualifiersPdfRow, last: boolean) {
    const at = baselineIn(y, M.rowHeight, M.textSize)
    let leadX = left + M.cellPadX
    if (row.eventNumber) {
      leadX += badge(row.eventNumber, leadX, y, M.rowHeight, M.rowBadgeSize, M.rowBadgeTextSize) + M.badgeGap
    }
    setType("normal", M.textSize)
    doc.text(fit(row.lead, left + leadWidth - M.cellPadX - leadX), leadX, at)
    setType("bold", M.textSize)
    doc.text(fit(row.time, M.timeWidth - M.cellPadX * 2), timeX + M.cellPadX, at)
    setType("normal", M.textSize, SUCCESS)
    doc.text(fit(row.margin, M.marginWidth - M.cellPadX * 2), marginX + M.cellPadX, at)
    setType("normal", M.textSize, INK_SECONDARY)
    doc.text(fit(row.meet, meetWidth - M.cellPadX * 2), meetX + M.cellPadX, at)
    doc.text(fit(row.date, M.dateWidth - M.cellPadX * 2), dateX + M.cellPadX, at)
    y += M.rowHeight
    if (!last) {
      doc.setLineWidth(0.5)
      doc.setDrawColor(...BORDER)
      doc.line(left + M.cellPadX, y, right - M.cellPadX, y)
    }
  }

  input.sections.forEach((section, index) => {
    if (index > 0) y += M.sectionGap
    // Keep a heading with at least its first row.
    if (y + M.sectionHeight + M.rowHeight > contentBottom) newPage()
    drawSectionHeading(section, false)
    section.rows.forEach((row, rowIndex) => {
      if (y + M.rowHeight > contentBottom) {
        newPage()
        drawSectionHeading(section, true)
      }
      drawRow(row, rowIndex === section.rows.length - 1)
    })
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

import type { jsPDF } from "jspdf"
import { MEET_HEADER, type MeetHeaderDetails } from "@swimbuzz/shared"

type RGB = [number, number, number]

/** Stroke width (pt) that takes regular Helvetica to a semibold: results times, a step under bold. */
export const SEMIBOLD_STROKE = 0.42
/** Letter spacing (pt) that gives back the gap the semibold stroke takes from between glyphs. */
export const SEMIBOLD_CHAR_SPACE = 0.3

/**
 * Text in the current font and color stroked to a semibold, with its letter spacing, from `x` — or
 * ending at `x` when `align` is "right" (measured here, since the spacing widens it).
 */
export function semiboldText(doc: jsPDF, value: string, x: number, baseline: number, align?: "right") {
  // jsPDF spaces after every glyph; only the gaps between them show.
  const width = doc.getTextWidth(value) + Math.max(0, value.length - 1) * SEMIBOLD_CHAR_SPACE
  doc.setDrawColor(doc.getTextColor())
  doc.setLineWidth(SEMIBOLD_STROKE)
  doc.text(value, align === "right" ? x - width : x, baseline, {
    renderingMode: "fillThenStroke",
    charSpace: SEMIBOLD_CHAR_SPACE,
  })
}

/** Helvetica's cap height, as a fraction of the font size: where capitals visibly top out. */
export const HELVETICA_CAP_HEIGHT = 0.718

// An unofficial meet's pill (UnofficialMeetBadge) in light-theme tokens: the PDFs print on white.
const BADGE_TEXT: RGB = [140, 107, 56]
const BADGE_BORDER: RGB = [203, 188, 165]
const BADGE_FILL: RGB = [244, 240, 235]
const BADGE_LABEL = "UNOFFICIAL"

function badgeMetrics(titleSize: number) {
  const textSize = titleSize * MEET_HEADER.badgeTextSize
  return {
    textSize,
    charSpace: textSize * MEET_HEADER.badgeTracking,
    height: titleSize * MEET_HEADER.badgeHeight,
    padX: titleSize * MEET_HEADER.badgePadX,
    gap: titleSize * MEET_HEADER.badgeGap,
  }
}

/** Width of the label in the pill's font, leaving the document's font as it was. */
function badgeLabelWidth(doc: jsPDF, textSize: number, charSpace: number): number {
  const font = doc.getFont()
  const fontSize = doc.getFontSize()
  doc.setFont("helvetica", "bold")
  doc.setFontSize(textSize)
  const width = doc.getTextWidth(BADGE_LABEL) + (BADGE_LABEL.length - 1) * charSpace
  doc.setFont(font.fontName, font.fontStyle)
  doc.setFontSize(fontSize)
  return width
}

/** Room the "Unofficial" pill takes after a meet name of `titleSize`, its gap included. */
export function unofficialPdfBadgeReserve(doc: jsPDF, titleSize: number): number {
  const m = badgeMetrics(titleSize)
  return m.gap + badgeLabelWidth(doc, m.textSize, m.charSpace) + m.padX * 2
}

/**
 * A meet name's lines within `maxWidth` in the current font, leaving room after the last line for
 * the "Unofficial" pill when `reserve` (from unofficialPdfBadgeReserve) is set.
 */
export function splitMeetPdfTitle(doc: jsPDF, name: string, maxWidth: number, reserve: number): string[] {
  const lines = doc.splitTextToSize(name, maxWidth) as string[]
  if (!reserve || doc.getTextWidth(lines[lines.length - 1] ?? "") + reserve <= maxWidth) return lines
  return doc.splitTextToSize(name, Math.max(maxWidth / 2, maxWidth - reserve)) as string[]
}

/**
 * The "UNOFFICIAL" pill after a meet name's last line (`lastLine` drawn from `x` on `baseline`, in
 * the current font), centered on the name's capitals. Leaves the pill's font set.
 */
export function drawUnofficialPdfBadge(
  doc: jsPDF,
  lastLine: string,
  x: number,
  baseline: number,
  titleSize: number
) {
  const m = badgeMetrics(titleSize)
  const left = x + doc.getTextWidth(lastLine) + m.gap
  const width = badgeLabelWidth(doc, m.textSize, m.charSpace) + m.padX * 2
  const center = baseline - (titleSize * HELVETICA_CAP_HEIGHT) / 2
  doc.setFillColor(...BADGE_FILL)
  doc.setDrawColor(...BADGE_BORDER)
  doc.setLineWidth(0.75)
  doc.roundedRect(left, center - m.height / 2, width, m.height, m.height / 2, m.height / 2, "FD")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(m.textSize)
  doc.setTextColor(...BADGE_TEXT)
  doc.text(BADGE_LABEL, left + m.padX, center + (m.textSize * HELVETICA_CAP_HEIGHT) / 2, { charSpace: m.charSpace })
}

// Spacing relative to the text size, like the meet page's gap-1.5 icon gap and gap-x-5 item gap.
const ICON_GAP = 0.35
const ITEM_GAP = 1.1
/** Narrowest a cut-down location may get before it's left out instead. */
const MIN_LOCATION = 4

/**
 * The date and location on one line from `x`, each after its icon (the meet page's calendar and
 * map pin, as vector strokes), within `maxWidth`: the location is cut short with an ellipsis, or
 * left out when it would be too short to read.
 */
export function drawMeetPdfDetails(
  doc: jsPDF,
  details: MeetHeaderDetails,
  x: number,
  baseline: number,
  maxWidth: number,
  size: number,
  color: RGB
) {
  doc.setFont("helvetica", "normal")
  doc.setFontSize(size)
  doc.setTextColor(...color)
  doc.setDrawColor(...color)
  doc.setLineWidth(size / 12)
  doc.setLineCap("round")
  doc.setLineJoin("round")

  // Icons center on the text's x-height, the same center the PDFs use to place text in a box.
  const iconTop = baseline - size * 0.35 - size / 2
  const textOffset = size + size * ICON_GAP
  const right = x + maxWidth

  let cursor = x
  if (cursor + textOffset + doc.getTextWidth(details.date) <= right) {
    calendarIcon(doc, cursor, iconTop, size)
    doc.text(details.date, cursor + textOffset, baseline)
    cursor += textOffset + doc.getTextWidth(details.date) + size * ITEM_GAP
  }
  if (details.location) {
    const room = right - cursor - textOffset
    if (room >= size * MIN_LOCATION) {
      mapPinIcon(doc, cursor, iconTop, size)
      doc.text(fit(doc, details.location, room), cursor + textOffset, baseline)
    }
  }

  doc.setLineCap("butt")
  doc.setLineJoin("miter")
}

function fit(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text
  let cut = text
  while (cut.length > 0 && doc.getTextWidth(`${cut}…`) > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

// Lucide's calendar and map-pin (InfoIcon), drawn from their 24×24 viewBox into a `size` box.

function calendarIcon(doc: jsPDF, x: number, top: number, size: number) {
  const u = size / 24
  const at = (cx: number, cy: number): [number, number] => [x + cx * u, top + cy * u]
  doc.roundedRect(...at(3, 4), 18 * u, 18 * u, 2 * u, 2 * u, "S")
  doc.line(...at(3, 10), ...at(21, 10))
  doc.line(...at(8, 2), ...at(8, 6))
  doc.line(...at(16, 2), ...at(16, 6))
}

function mapPinIcon(doc: jsPDF, x: number, top: number, size: number) {
  const u = size / 24
  const at = (cx: number, cy: number): [number, number] => [x + cx * u, top + cy * u]
  // Bezier handle length for a quarter circle of radius 8.
  const k = 8 * 0.5523
  doc.path([
    { op: "m", c: at(20, 10) },
    { op: "c", c: [...at(20, 16), ...at(12, 22), ...at(12, 22)] },
    { op: "c", c: [...at(12, 22), ...at(4, 16), ...at(4, 10)] },
    { op: "c", c: [...at(4, 10 - k), ...at(12 - k, 2), ...at(12, 2)] },
    { op: "c", c: [...at(12 + k, 2), ...at(20, 10 - k), ...at(20, 10)] },
    { op: "h", c: [] },
  ])
  doc.stroke()
  doc.circle(...at(12, 10), 3 * u, "S")
}

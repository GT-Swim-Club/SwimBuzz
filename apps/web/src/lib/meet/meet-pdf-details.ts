import type { jsPDF } from "jspdf"
import type { MeetHeaderDetails } from "@swimbuzz/shared"

type RGB = [number, number, number]

/** Helvetica's cap height, as a fraction of the font size: where capitals visibly top out. */
export const HELVETICA_CAP_HEIGHT = 0.718

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

import { jsPDF } from "jspdf"
import {
  meetFileName,
  relayLineupRoundLabel,
  relayShareFilename,
  relayShareRows,
  relayShareTime,
  type RelayLineup,
  type RelayShareEvent,
} from "@swimbuzz/shared"

export type RelaysPdfInput = {
  meetName: string
  /** Meet icon as a square PNG (logo fitted whole, transparent padding), or null to leave it out. */
  iconPng: Uint8Array | null
  /** Published relays only, in display order. */
  events: RelayShareEvent[]
}

type RGB = [number, number, number]

// Light-theme brand tokens (variables.css); the PDF is always printed on white.
const ACCENT: RGB = [140, 107, 56]
const ACCENT_BORDER: RGB = [203, 188, 165]
const ACCENT_BG: RGB = [244, 240, 235]
const INK: RGB = [31, 31, 31]
const BORDER: RGB = [234, 234, 234]

/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

/** Breathing room added to the widest event so names don't sit against the border. */
const EXTRA_COLUMN_PT = px(16)

// Grid sizes at full scale; the whole grid shrinks together to fit the page.
const GRID = {
  columnGap: px(16),
  bandGap: px(24),
  cardGap: px(8),
  eventHeaderHeight: px(32),
  // Badge sizes match the roster summary PDF's and the relays PNG's.
  badgeSize: px(21),
  badgeGap: px(8),
  badgePx: px(3),
  cardHeaderHeight: px(32),
  legHeight: px(28),
  cardPx: px(12),
  cardRadius: px(8),
  timeGap: px(8),
  textSize: px(14),
  badgeTextSize: px(10.5),
}

export function relaysPdfFilename(meetName: string): string {
  return relayShareFilename(meetName, "pdf")
}

function relayTitle(relay: RelayLineup): string {
  const round = relayLineupRoundLabel(relay.round)
  return `${relay.letter} Relay${round ? ` · ${round}` : ""}`
}

/** Portrait wins over landscape only when it shows the grid at least this much larger. */
const PORTRAIT_MIN_GAIN = 1.1

/**
 * The published relays on a single Letter page, laid out like the Share PNG: the meet icon
 * and name, then a women's row and a men's row (mixed at the end), one event per column with
 * its relay cards underneath, lined up across columns by position. The grid scales down as a
 * whole until its widest row and its height fit the page, and every row's events stretch to
 * share the page's full width. Landscape, unless
 * the relays are tall enough that portrait keeps the text noticeably bigger.
 */
export function buildRelaysPdf(input: RelaysPdfInput): jsPDF {
  const landscape = drawRelaysPdf(input, "landscape")
  if (landscape.scale >= 1) return landscape.doc
  const portrait = drawRelaysPdf(input, "portrait")
  return portrait.scale > landscape.scale * PORTRAIT_MIN_GAIN ? portrait.doc : landscape.doc
}

function drawRelaysPdf(
  input: RelaysPdfInput,
  orientation: "landscape" | "portrait"
): { doc: jsPDF; scale: number } {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = px(48)
  const contentWidth = pageWidth - margin * 2
  const contentBottom = pageHeight - margin

  const titleSize = px(32)
  const titleLh = px(38)
  const eyebrowSize = px(12)
  const eyebrowGap = px(10)
  const iconSize = px(64)
  const iconGap = px(16)
  const headerGap = px(24)

  let m = GRID

  function setType(style: "normal" | "bold", size: number, color: RGB = INK) {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }

  /** Text cut to `maxWidth` with an ellipsis, in the current font. */
  function fit(text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) return text
    let cut = text
    while (cut.length > 0 && doc.getTextWidth(`${cut}…`) > maxWidth) cut = cut.slice(0, -1)
    return `${cut.trimEnd()}…`
  }

  /** Baseline that vertically centers `size` text in a box starting at `top`. */
  function centeredBaseline(top: number, height: number, size: number): number {
    return top + height / 2 + size * 0.35
  }

  function badgeWidth(number: number): number {
    setType("bold", m.badgeTextSize)
    return Math.max(m.badgeSize, doc.getTextWidth(String(number)) + m.badgePx * 2)
  }

  /** Width an event needs to show every name and time in full, at the current scale. */
  function eventWidth(event: RelayShareEvent): number {
    // Badge first: measuring it switches to the badge's font size.
    const badge = event.number ? badgeWidth(event.number) + m.badgeGap : 0
    setType("bold", m.textSize)
    let width = badge + doc.getTextWidth(event.name)
    for (const relay of event.relays) {
      setType("bold", m.textSize)
      const header = doc.getTextWidth(relayTitle(relay)) + m.timeGap + doc.getTextWidth(relayShareTime(relay) || "—")
      setType("normal", m.textSize)
      const legs = Math.max(0, ...relay.legs.map((leg) => doc.getTextWidth(leg.name)))
      width = Math.max(width, Math.max(header, legs) + m.cardPx * 2)
    }
    return width
  }

  function cardHeight(relay: RelayLineup): number {
    return m.cardHeaderHeight + Math.max(1, relay.legs.length) * m.legHeight
  }

  /** Height of each card row in a band: its tallest card. */
  function cardRowHeights(band: RelayShareEvent[]): number[] {
    const count = Math.max(0, ...band.map((event) => event.relays.length))
    return Array.from({ length: count }, (_, index) =>
      Math.max(0, ...band.map((event) => (event.relays[index] ? cardHeight(event.relays[index]) : 0)))
    )
  }

  function gridHeight(bands: RelayShareEvent[][]): number {
    return bands.reduce((total, band, bandIndex) => {
      const rows = cardRowHeights(band)
      const cards = rows.reduce((sum, height) => sum + height, 0) + m.cardGap * Math.max(0, rows.length - 1)
      return total + (bandIndex > 0 ? m.bandGap : 0) + m.eventHeaderHeight + m.cardGap + cards
    }, 0)
  }

  function drawEventHeader(event: RelayShareEvent, x: number, width: number, top: number) {
    let textX = x
    if (event.number) {
      const badge = badgeWidth(event.number)
      const badgeTop = top + (m.eventHeaderHeight - m.badgeSize) / 2
      setType("bold", m.badgeTextSize, ACCENT)
      doc.setDrawColor(...ACCENT_BORDER)
      doc.setFillColor(...ACCENT_BG)
      doc.setLineWidth(0.75)
      doc.roundedRect(x, badgeTop, badge, m.badgeSize, m.badgeSize / 2, m.badgeSize / 2, "FD")
      doc.text(String(event.number), x + badge / 2, centeredBaseline(badgeTop, m.badgeSize, m.badgeTextSize), {
        align: "center",
      })
      textX = x + badge + m.badgeGap
    }
    setType("bold", m.textSize)
    doc.text(fit(event.name, x + width - textX), textX, centeredBaseline(top, m.eventHeaderHeight, m.textSize))
  }

  function drawCard(relay: RelayLineup, x: number, width: number, top: number) {
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.75)
    doc.roundedRect(x, top, width, cardHeight(relay), m.cardRadius, m.cardRadius, "S")

    const innerX = x + m.cardPx
    const innerWidth = width - m.cardPx * 2
    setType("bold", m.textSize)
    const time = relayShareTime(relay) || "—"
    const timeWidth = doc.getTextWidth(time)
    const headerBaseline = centeredBaseline(top, m.cardHeaderHeight, m.textSize)
    doc.text(time, x + width - m.cardPx, headerBaseline, { align: "right" })
    doc.text(fit(relayTitle(relay), innerWidth - timeWidth - m.timeGap), innerX, headerBaseline)

    let legTop = top + m.cardHeaderHeight
    const legs = [...relay.legs].sort((a, b) => a.leg - b.leg)
    for (const leg of legs) {
      doc.setDrawColor(...BORDER)
      doc.line(x, legTop, x + width, legTop)
      setType("normal", m.textSize)
      doc.text(fit(leg.name, innerWidth), innerX, centeredBaseline(legTop, m.legHeight, m.textSize))
      legTop += m.legHeight
    }
  }

  doc.setProperties({ title: meetFileName("Relays", input.meetName), author: "SwimBuzz", creator: "SwimBuzz" })

  // Header: icon, then the meet name and eyebrow centered beside it.
  let iconDrawn = false
  if (input.iconPng) {
    try {
      doc.addImage(input.iconPng, "PNG", margin, margin, iconSize, iconSize)
      iconDrawn = true
    } catch {
      // Unreadable image: leave the icon out.
    }
  }
  const textX = iconDrawn ? margin + iconSize + iconGap : margin
  setType("bold", titleSize)
  const titleLines = doc.splitTextToSize(input.meetName, pageWidth - margin - textX) as string[]
  const textHeight = titleSize * 0.85 + (titleLines.length - 1) * titleLh + eyebrowGap + eyebrowSize
  const textTop = margin + (iconDrawn ? Math.max(0, (iconSize - textHeight) / 2) : 0)
  let baseline = textTop + titleSize * 0.85
  titleLines.forEach((line, index) => {
    if (index > 0) baseline += titleLh
    doc.text(line, textX, baseline)
  })
  setType("bold", eyebrowSize, ACCENT)
  baseline += eyebrowGap + eyebrowSize
  doc.text("RELAYS", textX, baseline, { charSpace: px(1.5) })
  const gridTop = Math.max(baseline, iconDrawn ? margin + iconSize : 0) + headerGap

  // Measure at full size, then scale the grid so its widest row and its height fit the page.
  const bands = relayShareRows(input.events)
    .map((row) => row.filter((event): event is RelayShareEvent => event != null))
    .filter((row) => row.length > 0)
  const columns = Math.max(1, ...bands.map((row) => row.length))
  const naturalColumn = Math.max(0, ...input.events.map(eventWidth)) + EXTRA_COLUMN_PT
  const naturalWidth = columns * naturalColumn + (columns - 1) * m.columnGap
  const naturalHeight = gridHeight(bands)
  const scale = Math.min(1, contentWidth / naturalWidth, (contentBottom - gridTop) / Math.max(1, naturalHeight))
  m = Object.fromEntries(Object.entries(GRID).map(([key, value]) => [key, value * scale])) as typeof GRID

  // Every row spans the full width: its events share the page equally.
  let y = gridTop
  bands.forEach((band, bandIndex) => {
    if (bandIndex > 0) y += m.bandGap
    const columnWidth = (contentWidth - m.columnGap * (band.length - 1)) / band.length
    const columnX = (index: number) => margin + index * (columnWidth + m.columnGap)
    band.forEach((event, column) => drawEventHeader(event, columnX(column), columnWidth, y))
    y += m.eventHeaderHeight + m.cardGap
    cardRowHeights(band).forEach((height, index) => {
      if (index > 0) y += m.cardGap
      band.forEach((event, column) => {
        const relay = event.relays[index]
        if (relay) drawCard(relay, columnX(column), columnWidth, y)
      })
      y += height
    })
  })

  return { doc, scale }
}

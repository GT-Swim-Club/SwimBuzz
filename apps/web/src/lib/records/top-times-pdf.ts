import { jsPDF } from "jspdf"
import {
  MANUAL_RECORD_MARK,
  MANUAL_RECORD_NOTE,
  MEET_HEADER,
  RECORDS_EXPORT,
  formatRecordTime,
  recordSwimmerLabel,
  TOP_TIMES_LIMIT,
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
  /** The club logo (public/swimbuzz-logo.png) as PNG bytes, beside the header; null leaves it out. */
  logoPng?: Uint8Array | null
}

/** The club logo's public path; the browser fetches it, the server reads it from apps/web/public. */
export const TOP_TIMES_LOGO_PATH = "/swimbuzz-logo.png"

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

/** Individual events' cards side by side in each row, wide enough for each swim's meet. */
const COLUMNS = 2
/** Relays, with all four swimmers on a line beside the meet, get the page's width: one card a row. */
const RELAY_COLUMNS = 1
/**
 * The swimmer column's share of the room it splits with the Meet column when both fit with room to
 * spare (the extra goes to the meet); when they don't, they split it in proportion to their widths.
 */
const NAME_SHARE = 0.48
/** A relay's swimmer column, for all four names on one line. */
const RELAY_NAME_SHARE = 0.65
/** A swimmer or meet name too wide for its column shrinks to this much of the text size before it's cut. */
const MIN_TEXT_SCALE = 0.85
/** The logo's corner radius as a share of its size, like the nav's rounded-md 32px logo. */
const LOGO_RADIUS = 6 / 32

/** Relay swimmers per line: all four ("Sara Ukic, Rachel Fulton, Caroline Porterfield, Sabina Mrzyglod"). */
const RELAY_NAMES_PER_LINE = 4

const M = {
  margin: px(40),
  titleSize: TITLE_SIZE,
  eyebrowSize: TITLE_SIZE * MEET_HEADER.eyebrowSize,
  eyebrowCharSpace: px(1.5),
  detailsSize: px(14),
  titleGapAbove: TITLE_SIZE * MEET_HEADER.gapAboveTitle,
  titleGapBelow: TITLE_SIZE * MEET_HEADER.gapBelowTitle,
  logoGap: TITLE_SIZE * MEET_HEADER.iconGap,
  logoOvershoot: TITLE_SIZE * MEET_HEADER.iconOvershoot,
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
 * Top 10 view: each event's list as a card, in records-table order (rank, swimmer(s), meet, year,
 * time; this season's swims in bold gold on a gold highlight), two cards to a row and rows sized so
 * four rows of full top 10s fit on a page; a card with fewer than ten swims keeps a full card's room.
 * Relays get one full-width card a row, their four swimmers on one line beside the meet, flowing on
 * right after the individual events. A row only holds one kind (individual or relay), and never
 * splits across pages.
 */
export function buildTopTimesPdf({ data, logoPng = null }: TopTimesPdfInput): jsPDF {
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

  /**
   * Text at (x, y) in the current font, shrunk (down to MIN_TEXT_SCALE) to fit `maxWidth` before
   * it's cut with an ellipsis, so long swimmer and meet names rarely lose letters.
   */
  function textFitted(raw: string, x: number, y: number, maxWidth: number) {
    const size = doc.getFontSize()
    const width = doc.getTextWidth(pdfText(raw))
    if (width > maxWidth) doc.setFontSize(Math.max(size * MIN_TEXT_SCALE, (size * maxWidth) / width))
    doc.text(fit(raw, maxWidth), x, y)
    doc.setFontSize(size)
  }

  const baselineIn = (top: number, height: number, size: number) => top + height / 2 + size * 0.35

  // ---- header (first page only) ----

  // The club logo beside the eyebrow, title and span, as tall as all three and reaching a little
  // past both ends, like a meet PDF's icon; its corners rounded like the nav's logo.
  let textX = left
  if (logoPng) {
    const logoSize =
      M.eyebrowSize * HELVETICA_CAP_HEIGHT +
      M.titleGapAbove +
      M.titleSize * HELVETICA_CAP_HEIGHT +
      M.titleGapBelow +
      M.detailsSize * HELVETICA_CAP_HEIGHT +
      M.logoOvershoot * 2
    const logoTop = M.margin - M.logoOvershoot
    const radius = logoSize * LOGO_RADIUS
    try {
      doc.saveGraphicsState()
      doc.roundedRect(left, logoTop, logoSize, logoSize, radius, radius, null)
      doc.clip()
      doc.discardPath()
      doc.addImage(logoPng, "PNG", left, logoTop, logoSize, logoSize)
      textX = left + logoSize + M.logoGap
    } catch {
      // Unreadable image: leave the logo out.
    } finally {
      doc.restoreGraphicsState()
    }
  }

  setType("bold", M.eyebrowSize, ACCENT)
  let baseline = M.margin + M.eyebrowSize * HELVETICA_CAP_HEIGHT
  doc.text(RECORDS_EXPORT.eyebrow.toUpperCase(), textX, baseline, { charSpace: M.eyebrowCharSpace })
  setType("bold", M.titleSize)
  baseline += M.titleGapAbove + M.titleSize * HELVETICA_CAP_HEIGHT
  doc.text(fit(title, right - textX), textX, baseline)
  setType("normal", M.detailsSize, INK_SECONDARY)
  baseline += M.titleGapBelow + M.detailsSize * HELVETICA_CAP_HEIGHT
  doc.text(fit(details, right - textX), textX, baseline)
  // The logo reaches past the span's baseline: keep the cards clear of it.
  if (logoPng) baseline += M.logoOvershoot
  let y = baseline + M.headerGap

  /** A row's swimmer lines: a relay's go on one line, and a relay with no names known is one "–". */
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
  /** A full row: one line, a relay's swimmers included. */
  const fullRowHeight = () => M.lineHeight + M.rowPadY * 2
  /**
   * A card's height, with blank room for the rest of a top 10 when it has fewer than ten swims ("No
   * swims yet." takes the first row's place).
   */
  const blockHeight = (event: TeamTopTimesEvent) =>
    M.bandHeight +
    (event.times.length > 0
      ? event.times.reduce((sum, time) => sum + rowHeight(event, time), 0)
      : M.lineHeight + M.rowPadY * 2) +
    Math.max(0, TOP_TIMES_LIMIT - Math.max(1, event.times.length)) * fullRowHeight()

  /**
   * The swimmer column's width in every card of one kind (individual or relay), so each column starts
   * and ends in the same place on every card. Sized from every swimmer and meet of that kind: names
   * get what they need when both fit (the meet takes the rest), and otherwise the split that cuts the
   * fewest entries (then shrinks them least), so one long meet name doesn't squeeze every swimmer.
   */
  const nameColumnWidths = new Map<boolean, number>()
  function nameColumnWidth(relay: boolean, blockWidth: number): number {
    const known = nameColumnWidths.get(relay)
    if (known !== undefined) return known
    // The room between the rank and the year, as drawBlock lays a card out.
    const span = blockWidth - M.rankWidth - M.cellPadX * 2 - M.timeWidth - M.yearWidth
    const room = span - M.cellPadX
    const events = data.events.filter((event) => event.relay === relay)
    const widths = (texts: Array<{ text: string; bold: boolean }>) =>
      texts.map(({ text, bold }) => {
        setType(bold ? "bold" : "normal", M.textSize)
        return doc.getTextWidth(pdfText(text))
      })
    const nameWidths = widths(
      events.flatMap((event) =>
        event.times.flatMap((time) => nameLines(event, time).map((text) => ({ text, bold: time.isThisSeason })))
      )
    )
    const meetWidths = widths(
      events.flatMap((event) =>
        event.times.flatMap((time) => (time.meetName ? [{ text: time.meetName, bold: false }] : []))
      )
    )
    const nameNeed = Math.max(0, ...nameWidths)
    const meetNeed = Math.max(0, ...meetWidths)
    const share = relay ? RELAY_NAME_SHARE : NAME_SHARE
    let width: number
    if (meetNeed === 0) width = span
    else if (nameNeed + meetNeed <= room) width = Math.min(Math.max(nameNeed, room * share), room - meetNeed)
    else {
      /** [entries cut, total shrink] for a name column `w` wide: lower is better. */
      const cost = (w: number): [number, number] => {
        let cuts = 0
        let shrink = 0
        const tally = (list: number[], column: number) => {
          for (const textWidth of list) {
            if (textWidth * MIN_TEXT_SCALE > column) cuts++
            shrink += Math.max(0, textWidth - column)
          }
        }
        tally(nameWidths, w)
        tally(meetWidths, room - w)
        return [cuts, shrink]
      }
      // Only the widths where some entry starts or stops fitting (at full or shrunk size) matter.
      const candidates = [
        room * share,
        ...nameWidths.flatMap((textWidth) => [textWidth, textWidth * MIN_TEXT_SCALE]),
        ...meetWidths.flatMap((textWidth) => [room - textWidth, room - textWidth * MIN_TEXT_SCALE]),
      ].filter((w) => w > 0 && w < room)
      width = candidates.reduce((best, w) => {
        const [cuts, shrink] = cost(w)
        const [bestCuts, bestShrink] = cost(best)
        return cuts < bestCuts || (cuts === bestCuts && shrink < bestShrink) ? w : best
      }, room * share)
    }
    nameColumnWidths.set(relay, width)
    return width
  }

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
    // One split for every card of this kind, so the columns line up from card to card.
    const nameWidth = nameColumnWidth(event.relay, blockWidth)
    const meetX = nameX + nameWidth + M.cellPadX
    const meetWidth = yearRight - M.yearWidth - meetX
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
      const rankText = tied ? `T${time.rank}` : String(time.rank)
      doc.text(rankText, rankRight, firstLine, { align: "right" })
      if (time.manual) {
        // The gold "*" hangs off the rank's left edge ("*3"), like on the page.
        doc.setTextColor(...ACCENT)
        doc.text(MANUAL_RECORD_MARK, rankRight - doc.getTextWidth(rankText) - px(1), firstLine, { align: "right" })
      }
      setType(season ? "bold" : "normal", M.textSize, season ? ACCENT : INK)
      const lines = nameLines(event, time)
      lines.forEach((name, i) => textFitted(name, nameX, firstLine + i * M.lineHeight, nameWidth))
      if (time.meetName) {
        setType("normal", M.textSize, season ? ACCENT : INK_SECONDARY)
        textFitted(time.meetName, meetX, firstLine, meetWidth)
      }
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

  // Rows of consecutive events of one kind: an individual event never shares a row with a relay.
  const rows: TeamTopTimesEvent[][] = []
  for (const event of data.events) {
    const last = rows[rows.length - 1]
    if (last && last.length < columnsFor(last[0]) && last[0].relay === event.relay) last.push(event)
    else rows.push([event])
  }

  const rowHeightOf = (row: TeamTopTimesEvent[]) => Math.max(...row.map((event) => blockHeight(event)))

  // Rows of cards flow down the page, each moving to a new page when it doesn't fit (never the page's
  // first); the relays carry on right after the individual events.
  for (const row of rows) {
    const height = rowHeightOf(row)
    if (y > M.margin && y + height > contentBottom) {
      doc.addPage()
      y = M.margin
    }
    const blockWidth = widthFor(columnsFor(row[0]))
    row.forEach((event, column) => drawBlock(event, left + column * (blockWidth + M.columnGap), y, blockWidth))
    y += height + M.blockGap
  }

  // Footer: title · span on the left; "*Unverified" (when any time carries the gold "*") and the page number on the right.
  const anyManual = data.events.some((event) => event.times.some((time) => time.manual))
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    setType("normal", M.footerSize, INK_TERTIARY)
    const pageLabel = `${page} / ${pages}`
    doc.text(pageLabel, right, footerBaseline, { align: "right" })
    let rightEdge = right - doc.getTextWidth(pageLabel)
    if (anyManual) {
      rightEdge -= px(16)
      doc.text(MANUAL_RECORD_NOTE, rightEdge, footerBaseline, { align: "right" })
      rightEdge -= doc.getTextWidth(MANUAL_RECORD_NOTE)
      doc.setTextColor(...ACCENT)
      doc.text(MANUAL_RECORD_MARK, rightEdge, footerBaseline, { align: "right" })
      rightEdge -= doc.getTextWidth(MANUAL_RECORD_MARK)
      doc.setTextColor(...INK_TERTIARY)
    }
    doc.text(fit(`${title} · ${details}`, rightEdge - left - px(16)), left, footerBaseline)
  }
  return doc
}

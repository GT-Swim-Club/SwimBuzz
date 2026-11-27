import type { jsPDF } from "jspdf"
import { cleanEventName } from "@/lib/meet/meet-event-order"
import type { EventOrderWithHeats } from "@/lib/meet/event-heats"
import type { PlaceTimes } from "@/lib/meet/place-times"

type RGB = [number, number, number]

// Light-theme brand tokens (variables.css); the PDFs are always printed on white.
const ACCENT: RGB = [140, 107, 56]
const ACCENT_BORDER: RGB = [203, 188, 165]
const ACCENT_BG: RGB = [244, 240, 235]
const INK: RGB = [31, 31, 31]
const INK_SECONDARY: RGB = [89, 89, 89]
const INK_TERTIARY: RGB = [140, 140, 140]
const BORDER: RGB = [234, 234, 234]
const BORDER_SUBTLE: RGB = [228, 228, 231]
const WHITE: RGB = [255, 255, 255]

/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

const M = {
  maxColumns: 2,
  gap: px(10),
  radius: px(8),
  // Column heads like the roster summary PDF's "SEED" tag, rows like its row labels.
  sessionHeight: px(28),
  sessionSize: px(11),
  headHeight: px(20),
  headSize: px(9),
  rowHeight: px(21),
  rowSize: px(13),
  numberWidth: px(40),
  padX: px(10),
  /** From the WOMEN / MEN head to the HEATS head beside it. */
  heatsGap: px(12),
  /** A lone session's table, centered: this much wider than a half-page column. */
  soloScale: 1.15,
  /** Between a full-width table's number, heats and time columns. */
  timesGap: px(16),
  captionSize: px(11),
  captionGap: px(8),
}

type Fit = (value: string, maxWidth: number, charSpace?: number) => string

function setTypeOn(doc: jsPDF, style: "normal" | "bold", size: number, color: RGB = INK) {
  doc.setFont("helvetica", style)
  doc.setFontSize(size)
  doc.setTextColor(...color)
}

const centeredBaseline = (boxTop: number, height: number, size: number) => boxTop + height / 2 + size * 0.35

/** A session's own label, not the generic one an order of events with no sessions gets. */
const labelled = (label: string) => label.trim().toLowerCase() !== "order of events"

/**
 * A session's gold-tinted title strip across the top of its box (the box's rounded top corners,
 * like the event badges), its label in gold capitals centered over the table. Returns the strip's
 * bottom.
 */
function drawSessionStrip(doc: jsPDF, label: string, x: number, top: number, width: number, fit: Fit): number {
  doc.setFillColor(...ACCENT_BG)
  doc.roundedRect(x, top, width, M.sessionHeight + M.radius, M.radius, M.radius, "F")
  doc.setFillColor(...WHITE)
  doc.rect(x, top + M.sessionHeight, width, M.radius, "F")
  const charSpace = px(0.8)
  setTypeOn(doc, "bold", M.sessionSize, ACCENT)
  const title = fit(label.toUpperCase(), width - M.padX * 2, charSpace)
  const titleWidth = doc.getTextWidth(title) + title.length * charSpace
  doc.text(title, x + (width - titleWidth) / 2, centeredBaseline(top, M.sessionHeight, M.sessionSize), { charSpace })
  const bottom = top + M.sessionHeight
  doc.setDrawColor(...ACCENT_BORDER)
  doc.setLineWidth(0.75)
  doc.line(x, bottom, x + width, bottom)
  return bottom
}

export type EventOrderPdfLayout = {
  /** Where the section starts. */
  top: number
  pageLeft: number
  pageRight: number
  /** A half-page column's width, and the gap between the two columns. */
  columnWidth: number
  columnGap: number
  /** The lowest the section may reach on this page before it moves to a fresh one. */
  contentBottom: number
  /** A fresh page's top. */
  pageTop: number
  /** Text cut to `maxWidth` with an ellipsis, in the current font (plus any letter spacing). */
  fit: Fit
}

/**
 * A meet's order of events: each session a bordered table (Women # | Event | Men #, with a HEATS
 * column beside each number when a heat sheet gives counts), two sessions across in the page's
 * half-page columns. Moves to a fresh page when it doesn't fit under `top`. Returns the y just
 * below the section (`top` when there's nothing to draw).
 */
export function drawEventOrderPdf(doc: jsPDF, order: EventOrderWithHeats, layout: EventOrderPdfLayout): number {
  const { top, pageLeft, pageRight, columnWidth, columnGap, contentBottom, pageTop, fit } = layout
  const sessions = order.sessions.filter((session) => session.rows.length > 0)
  if (sessions.length === 0) return top

  const setType = (style: "normal" | "bold", size: number, color: RGB = INK) => setTypeOn(doc, style, size, color)

  const width = sessions.length === 1 ? columnWidth * M.soloScale : columnWidth
  type Session = EventOrderWithHeats["sessions"][number]
  const boxHeight = (session: Session) =>
    (labelled(session.label) ? M.sessionHeight : 0) + M.headHeight + session.rows.length * M.rowHeight

  /** One session's box at (x, yy). */
  function drawBox(session: Session, x: number, yy: number) {
    const height = boxHeight(session)
    let rowTop = yy
    if (labelled(session.label)) rowTop = drawSessionStrip(doc, session.label, x, yy, width, fit)
    // Column heads like the "SEED" tag.
    const headBaseline = centeredBaseline(rowTop, M.headHeight, M.headSize)
    const headSpace = px(1)
    setType("bold", M.headSize, INK_TERTIARY)
    const headWidth = (head: string) => doc.getTextWidth(head) + head.length * headSpace
    doc.text("WOMEN", x + M.padX, headBaseline, { charSpace: headSpace })
    const eventHead = "EVENT"
    doc.text(eventHead, x + (width - headWidth(eventHead)) / 2, headBaseline, { charSpace: headSpace })
    const menHead = "MEN"
    doc.text(menHead, x + width - M.padX - headWidth(menHead), headBaseline, { charSpace: headSpace })
    // Heat counts, when a heat sheet gives any: a HEATS column inside each event-number column,
    // the same distance in from both sides.
    const heatsHead = "HEATS"
    const hasHeats = session.rows.some((row) => row.womenHeats != null || row.menHeats != null)
    const heatsInset = M.padX + Math.max(headWidth("WOMEN"), headWidth(menHead)) + M.heatsGap
    const heatsWidth = headWidth(heatsHead)
    const womenHeatsCenter = x + heatsInset + heatsWidth / 2
    const menHeatsCenter = x + width - heatsInset - heatsWidth / 2
    if (hasHeats) {
      doc.text(heatsHead, womenHeatsCenter - heatsWidth / 2, headBaseline, { charSpace: headSpace })
      doc.text(heatsHead, menHeatsCenter - heatsWidth / 2, headBaseline, { charSpace: headSpace })
    }
    const eventInset = hasHeats ? heatsInset + heatsWidth + M.heatsGap / 2 : M.padX + M.numberWidth
    rowTop += M.headHeight
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.75)
    doc.line(x, rowTop, x + width, rowTop)
    session.rows.forEach((row, r) => {
      if (r > 0) {
        doc.setDrawColor(...BORDER_SUBTLE)
        doc.setLineWidth(0.5)
        doc.line(x, rowTop, x + width, rowTop)
      }
      const rowBaseline = centeredBaseline(rowTop, M.rowHeight, M.rowSize)
      // Event numbers in the badges' gold, events like row labels.
      setType("bold", M.rowSize, ACCENT)
      if (row.women != null) doc.text(String(row.women), x + M.padX, rowBaseline)
      if (row.men != null) doc.text(String(row.men), x + width - M.padX, rowBaseline, { align: "right" })
      setType("normal", M.rowSize, INK_SECONDARY)
      if (row.womenHeats != null) doc.text(String(row.womenHeats), womenHeatsCenter, rowBaseline, { align: "center" })
      if (row.menHeats != null) doc.text(String(row.menHeats), menHeatsCenter, rowBaseline, { align: "center" })
      setType("normal", M.rowSize, INK)
      const event = fit(cleanEventName(row.event), width - eventInset * 2)
      doc.text(event, x + width / 2, rowBaseline, { align: "center" })
      rowTop += M.rowHeight
    })
    doc.setDrawColor(...ACCENT_BORDER)
    doc.setLineWidth(0.75)
    doc.roundedRect(x, yy, width, height, M.radius, M.radius, "S")
  }

  // Down the left column, then the right: split where the columns come out most even, in order.
  const stackHeight = (list: Session[]) =>
    list.reduce((sum, session, i) => sum + (i > 0 ? M.gap : 0) + boxHeight(session), 0)
  let split = sessions.length
  let best = Infinity
  for (let k = 1; k <= sessions.length && M.maxColumns > 1; k++) {
    const tallest = Math.max(stackHeight(sessions.slice(0, k)), stackHeight(sessions.slice(k)))
    if (tallest < best) {
      best = tallest
      split = k
    }
  }
  const stacks = [sessions.slice(0, split), sessions.slice(split)]
  const height = Math.max(...stacks.map(stackHeight))
  let yy = top
  // Too tall for what's left under the header: start it on a fresh page.
  if (yy + height > contentBottom && yy > pageTop) {
    doc.addPage()
    yy = pageTop
  }
  // A lone session is centered on the page; several fill the columns from the left.
  const firstX = sessions.length === 1 ? pageLeft + (pageRight - pageLeft - width) / 2 : pageLeft
  stacks.forEach((stack, column) => {
    const x = firstX + column * (width + columnGap)
    let boxTop = yy
    for (const session of stack) {
      drawBox(session, x, boxTop)
      boxTop += boxHeight(session) + M.gap
    }
  })
  return yy + height
}

export type EventOrderTimesPdfLayout = {
  /** Where the section starts. */
  top: number
  pageLeft: number
  pageRight: number
  /** The lowest a session may reach on a page before it moves to a fresh one. */
  contentBottom: number
  /** A fresh page's top. */
  pageTop: number
  fit: Fit
  /** A row's times for one side (F = the women's numbers, M = the men's), or null for none. */
  placeTimes?: ((gender: "F" | "M", event: string) => PlaceTimes | null) | null
  /** A line over the tables saying where the times are from. */
  caption?: string | null
}

/** Each side's time columns, outside in: Women # … CHAMP 8TH 24TH | EVENT | 24TH 8TH CHAMP … Men #. */
const TIME_COLUMNS = [
  { head: "CHAMP", pick: (t: PlaceTimes) => t.champion },
  { head: "8TH", pick: (t: PlaceTimes) => t.eighth },
  { head: "24TH", pick: (t: PlaceTimes) => t.twentyFourth },
] as const

/**
 * A meet's order of events one session per row, each a full-width bordered table mirrored around
 * the event: the women's number (and heat count, when a heat sheet gives any) then `placeTimes`'
 * champion, 8th and 24th place times on the left, the men's the other way round on the right.
 * Every table shares its columns so they line up down the page; a missing time stays blank. A
 * session that doesn't fit what's left of a page starts the next. Returns the y just below the
 * section (`top` when there's nothing to draw).
 */
export function drawEventOrderTimesPdf(
  doc: jsPDF,
  order: EventOrderWithHeats,
  layout: EventOrderTimesPdfLayout
): number {
  const { top, pageLeft, pageRight, contentBottom, pageTop, fit } = layout
  const sessions = order.sessions.filter((session) => session.rows.length > 0)
  if (sessions.length === 0) return top
  const setType = (style: "normal" | "bold", size: number, color: RGB = INK) => setTypeOn(doc, style, size, color)
  const width = pageRight - pageLeft
  const headSpace = px(1)
  const headWidth = (head: string) => {
    setType("bold", M.headSize)
    return doc.getTextWidth(head) + head.length * headSpace
  }

  type Row = EventOrderWithHeats["sessions"][number]["rows"][number]
  const rows = sessions.flatMap((session) => session.rows)
  const timesFor = (row: Row, gender: "F" | "M") => {
    const number = gender === "F" ? row.women : row.men
    return number != null ? (layout.placeTimes?.(gender, row.event) ?? null) : null
  }
  const allTimes = rows.flatMap((row) => [timesFor(row, "F"), timesFor(row, "M")])
  const showTimes = allTimes.some((t) => t && TIME_COLUMNS.some((column) => column.pick(t)))
  const showHeats = rows.some((row) => row.womenHeats != null || row.menHeats != null)

  // Column widths, shared by every session: each as wide as its head or widest entry.
  const widestNumberHead = Math.max(headWidth("WOMEN"), headWidth("MEN"))
  setType("bold", M.rowSize)
  const numberWidth = Math.max(
    widestNumberHead,
    ...rows.flatMap((row) => [row.women, row.men]).map((n) => (n != null ? doc.getTextWidth(String(n)) : 0))
  )
  const heatsWidth = headWidth("HEATS")
  // Heads measured first: headWidth switches to the head font, and times are measured in the row's.
  const widestTimeHead = Math.max(...TIME_COLUMNS.map((column) => headWidth(column.head)))
  setType("normal", M.rowSize)
  const timeWidth = Math.max(
    widestTimeHead,
    ...allTimes.flatMap((t) =>
      t ? TIME_COLUMNS.map((column) => (column.pick(t) ? doc.getTextWidth(column.pick(t)!) : 0)) : []
    )
  )
  const gap = M.timesGap
  /** Each column's center, measured in from its side's edge. */
  const numberInset = M.padX
  const heatsCenter = numberInset + numberWidth + gap + heatsWidth / 2
  const firstTimeCenter = numberInset + numberWidth + (showHeats ? gap + heatsWidth : 0) + gap + timeWidth / 2
  const timeCenters = TIME_COLUMNS.map((_, i) => firstTimeCenter + i * (timeWidth + gap))
  const sideWidth = showTimes
    ? firstTimeCenter + (TIME_COLUMNS.length - 1) * (timeWidth + gap) + timeWidth / 2 + gap
    : showHeats
      ? heatsCenter + heatsWidth / 2 + gap
      : numberInset + M.numberWidth
  const eventWidth = width - sideWidth * 2

  const boxHeight = (session: (typeof sessions)[number]) =>
    (labelled(session.label) ? M.sessionHeight : 0) + M.headHeight + session.rows.length * M.rowHeight

  let y = top
  if (layout.caption) {
    setType("normal", M.captionSize, INK_SECONDARY)
    doc.text(fit(layout.caption, width), pageLeft, y + M.captionSize * 0.75)
    y += M.captionSize + M.captionGap
  }

  sessions.forEach((session, index) => {
    if (index > 0) y += M.gap
    const height = boxHeight(session)
    if (y + height > contentBottom && y > pageTop) {
      doc.addPage()
      y = pageTop
    }
    const x = pageLeft
    const left = (inset: number) => x + inset
    const right = (inset: number) => x + width - inset
    let rowTop = labelled(session.label) ? drawSessionStrip(doc, session.label, x, y, width, fit) : y

    // Column heads like the "SEED" tag.
    const headBaseline = centeredBaseline(rowTop, M.headHeight, M.headSize)
    setType("bold", M.headSize, INK_TERTIARY)
    const centered = (head: string, cx: number) =>
      doc.text(head, cx - headWidth(head) / 2, headBaseline, { charSpace: headSpace })
    setType("bold", M.headSize, INK_TERTIARY)
    doc.text("WOMEN", left(numberInset), headBaseline, { charSpace: headSpace })
    doc.text("MEN", right(numberInset) - headWidth("MEN"), headBaseline, { charSpace: headSpace })
    centered("EVENT", x + width / 2)
    if (showHeats) {
      centered("HEATS", left(heatsCenter))
      centered("HEATS", right(heatsCenter))
    }
    if (showTimes) {
      TIME_COLUMNS.forEach((column, i) => {
        centered(column.head, left(timeCenters[i]))
        centered(column.head, right(timeCenters[i]))
      })
    }
    rowTop += M.headHeight
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.75)
    doc.line(x, rowTop, x + width, rowTop)

    session.rows.forEach((row, r) => {
      if (r > 0) {
        doc.setDrawColor(...BORDER_SUBTLE)
        doc.setLineWidth(0.5)
        doc.line(x, rowTop, x + width, rowTop)
      }
      const baseline = centeredBaseline(rowTop, M.rowHeight, M.rowSize)
      // Event numbers in the badges' gold, events like row labels.
      setType("bold", M.rowSize, ACCENT)
      if (row.women != null) doc.text(String(row.women), left(numberInset), baseline)
      if (row.men != null) doc.text(String(row.men), right(numberInset), baseline, { align: "right" })
      setType("normal", M.rowSize, INK_SECONDARY)
      if (row.womenHeats != null) doc.text(String(row.womenHeats), left(heatsCenter), baseline, { align: "center" })
      if (row.menHeats != null) doc.text(String(row.menHeats), right(heatsCenter), baseline, { align: "center" })
      if (showTimes) {
        for (const [gender, at] of [["F", left], ["M", right]] as const) {
          const times = timesFor(row, gender)
          if (!times) continue
          TIME_COLUMNS.forEach((column, i) => {
            const value = column.pick(times)
            // The champion's time reads first, a touch darker than the cutoffs.
            setType("normal", M.rowSize, i === 0 ? INK : INK_SECONDARY)
            if (value) doc.text(value, at(timeCenters[i]), baseline, { align: "center" })
          })
        }
      }
      setType("normal", M.rowSize, INK)
      doc.text(fit(cleanEventName(row.event), eventWidth), x + width / 2, baseline, { align: "center" })
      rowTop += M.rowHeight
    })
    doc.setDrawColor(...ACCENT_BORDER)
    doc.setLineWidth(0.75)
    doc.roundedRect(x, y, width, height, M.radius, M.radius, "S")
    y += height
  })
  return y
}

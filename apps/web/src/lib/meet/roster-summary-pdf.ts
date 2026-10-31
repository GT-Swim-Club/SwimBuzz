import { jsPDF } from "jspdf"
import {
  MEET_HEADER,
  ROSTER_SUMMARY_PDF_LIMITS,
  meetFileName,
  rosterNameFirstLast,
  rosterNamePreferred,
  rosterSummaryPdfLabel,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfResult,
  type RosterSummaryPdfRow,
  type RosterSummaryPdfSection,
  type MeetHeaderDetails,
} from "@swimbuzz/shared"
import { formatDisplayTime, formatOrdinal } from "@/lib/utils"
import { HELVETICA_CAP_HEIGHT, drawMeetPdfDetails } from "@/lib/meet/meet-pdf-details"

export type RosterSummaryPdfInput = {
  meetName: string
  /** Date and location (with the school), under the meet name. */
  details: MeetHeaderDetails
  /** Meet icon as a square PNG (logo fitted whole, transparent padding), or null to leave it out. */
  iconPng: Uint8Array | null
  request: RosterSummaryPdfRequest
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
const FASTER: RGB = [56, 158, 13]
const SLOWER: RGB = [220, 38, 38]
// The roster summary's status and podium pill colors (SummaryRow).
const STATUS: RGB = [180, 83, 9]
const PODIUM: Record<number, RGB> = { 1: [180, 83, 9], 2: [71, 85, 105], 3: [194, 65, 12] }

/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

const TITLE_SIZE = px(26)

const M = {
  margin: px(40),
  titleSize: TITLE_SIZE,
  titleLh: px(30),
  // The header's other sizes follow the meet name's, in the proportions every meet header shares.
  eyebrowSize: TITLE_SIZE * MEET_HEADER.eyebrowSize,
  detailsSize: TITLE_SIZE * MEET_HEADER.detailsSize,
  titleGapAbove: TITLE_SIZE * MEET_HEADER.gapAboveTitle,
  titleGapBelow: TITLE_SIZE * MEET_HEADER.gapBelowTitle,
  iconGap: TITLE_SIZE * MEET_HEADER.iconGap,
  iconOvershoot: TITLE_SIZE * MEET_HEADER.iconOvershoot,
  headerGap: px(14),
  sectionGap: px(10),
  sectionHeaderHeight: px(26),
  sectionTitleSize: px(14),
  // Every event circle is the same size, here and in the relays PDF and PNG.
  badgeSize: px(21),
  badgeTextSize: px(10.5),
  badgeGap: px(6),
  rowPadY: px(3),
  labelLh: px(18),
  labelSize: px(13),
  subSize: px(11),
  inlineMetaGap: px(10),
  metaLh: px(13),
  metaSize: px(11),
  /** Room for a relay leg's stroke or number ("BK", "2") before the swimmer's name. */
  legTagWidth: px(20),
  timeSize: px(13),
  smallSize: px(11),
  seedTagSize: px(9),
  // Result block, sized for a half-page column.
  deltaWidth: px(40),
  timeWidth: px(66),
  placeWidth: px(32),
  rightGap: px(10),
  // Heat & lane ("H2 of 4 · L5" over the start time), right-aligned just left of the result block.
  heatLaneGap: px(8),
  columnGap: px(22),
  footerSize: px(10),
}

const RIGHT_WIDTH = M.deltaWidth + M.timeWidth + M.placeWidth

/** Medley relay legs in swim order. */
const MEDLEY_STROKES = ["BK", "BR", "FL", "FR"]

/** Stroke width (pt) that makes regular Helvetica read as a medium weight. */
const MEDIUM_STROKE = 0.18
/** Letter spacing (pt) that gives back some of the gap the stroke takes from between glyphs. */
const MEDIUM_CHAR_SPACE = 0.15

// ---- request validation ----------------------------------------------------

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, ROSTER_SUMMARY_PDF_LIMITS.text) : undefined
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 10000
    ? value
    : undefined
}

function parseResult(value: unknown): RosterSummaryPdfResult {
  const r = (value ?? {}) as Record<string, unknown>
  if (r.kind === "done") {
    return {
      kind: "done",
      time: text(r.time),
      status: text(r.status),
      delta: text(r.delta) ?? null,
      place: positiveInt(r.place),
      podium: r.podium === true,
    }
  }
  if (r.kind === "seed") {
    const seed = text(r.seed)
    return seed ? { kind: "seed", seed, seedRank: positiveInt(r.seedRank) } : { kind: "none" }
  }
  if (r.kind === "text") {
    const t = text(r.text)
    return t ? { kind: "text", text: t } : { kind: "none" }
  }
  return { kind: "none" }
}

function parseRow(value: unknown): RosterSummaryPdfRow | null {
  const r = (value ?? {}) as Record<string, unknown>
  const label = text(r.label)
  if (!label) return null
  const legs = Array.isArray(r.legs)
    ? r.legs
        .slice(0, ROSTER_SUMMARY_PDF_LIMITS.legs)
        .map(text)
        .filter((leg): leg is string => Boolean(leg))
    : undefined
  return {
    eventNumber: positiveInt(r.eventNumber),
    label,
    sub: text(r.sub),
    meta: text(r.meta),
    heatLane: text(r.heatLane),
    startTime: text(r.startTime),
    legs: legs?.length ? legs : undefined,
    result: r.result == null ? undefined : parseResult(r.result),
  }
}

/** The client's view as a PDF request, or null when it isn't one (or is over the size limits). */
export function parseRosterSummaryPdfRequest(body: unknown): RosterSummaryPdfRequest | null {
  const b = (body ?? {}) as Record<string, unknown>
  if (!Array.isArray(b.sections) || b.sections.length > ROSTER_SUMMARY_PDF_LIMITS.sections) return null
  let rowCount = 0
  const sections: RosterSummaryPdfSection[] = []
  for (const raw of b.sections) {
    const s = (raw ?? {}) as Record<string, unknown>
    const title = text(s.title)
    if (!title || !Array.isArray(s.rows)) return null
    rowCount += s.rows.length
    if (rowCount > ROSTER_SUMMARY_PDF_LIMITS.rows) return null
    const rows = s.rows.map(parseRow).filter((row): row is RosterSummaryPdfRow => row != null)
    if (rows.length === 0) continue
    sections.push({ title, eventNumber: positiveInt(s.eventNumber), rows })
  }
  return { heading: text(b.heading), sections, splitSections: b.splitSections === true }
}

// ---- drawing ---------------------------------------------------------------

/**
 * jsPDF's built-in Helvetica only covers WinAnsi: keep Latin-1 and the few typographic marks it has,
 * fold accented letters outside it to their base letter, and drop anything else.
 */
function pdfText(value: string): string {
  const winAnsiExtras = "“”‘’–—…•€™"
  let out = ""
  for (const ch of value.replace(/[−‐‑]/g, "-")) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0xff || winAnsiExtras.includes(ch)) out += ch
    else out += ch.normalize("NFKD").replace(/[^\x20-\xff]/g, "")
  }
  return out
}

/**
 * The PDF uses preferred names in place of legal first names ("Baumann, Matt"), where the
 * on-screen summary shows both ("Baumann, Matthew (Matt)").
 */
function withPreferredNames(request: RosterSummaryPdfRequest): RosterSummaryPdfRequest {
  return {
    ...request,
    sections: request.sections.map((section) => ({
      ...section,
      title: rosterNamePreferred(section.title),
      rows: section.rows.map((row) => ({
        ...row,
        label: rosterNamePreferred(row.label),
        legs: row.legs?.map(rosterNamePreferred),
      })),
    })),
  }
}

/**
 * The roster summary as the viewer sees it — sections of rows in a Letter portrait document, flowing
 * down two columns and across pages. Header like the relays PDF (meet icon, name, gold eyebrow), then
 * each section's title (with its event badge) and rows: the label, a meta line, relay legs, the heat
 * & lane over the start time, and the time, delta and place (or seed and seed rank) on the right. A section that fits in one column never
 * splits; a longer one continues in the next column under a repeated title.
 */
export function buildRosterSummaryPdf(input: RosterSummaryPdfInput): jsPDF {
  const request = withPreferredNames(input.request)
  // Medley relay rows, by their own label ("200 Medley A") or their event's title ("Relay A").
  const medleyRows = new Set(
    request.sections.flatMap((section) =>
      section.rows.filter((row) => /\bmedley\b/i.test(`${section.title} ${row.label}`))
    )
  )
  const doc =new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageLeft = M.margin
  const pageRight = pageWidth - M.margin
  const columnWidth = (pageRight - pageLeft - M.columnGap) / 2
  // The current column's edges; rows and section titles draw between them.
  let left = pageLeft
  let right = pageLeft + columnWidth
  // Footer sits in the bottom margin, clear of the last row.
  const footerTop = pageHeight - px(20)
  const contentBottom = pageHeight - M.margin
  /** Where the result block starts — or the column edge when the row has none. */
  const resultLeft = (row: RosterSummaryPdfRow) => (row.result ? right - RIGHT_WIDTH - M.rightGap : right)
  /**
   * The heat & lane column's width: as wide as the row's heat & lane or start time, whichever is
   * wider. Measures without disturbing the current font, since callers measure around it.
   */
  function heatLaneWidth(row: RosterSummaryPdfRow): number {
    const font = doc.getFont()
    const size = doc.getFontSize()
    doc.setFont("helvetica", "normal")
    doc.setFontSize(M.metaSize)
    const width = Math.max(
      row.heatLane ? doc.getTextWidth(pdfText(row.heatLane)) : 0,
      row.startTime ? doc.getTextWidth(pdfText(row.startTime)) : 0
    )
    doc.setFont(font.fontName, font.fontStyle)
    doc.setFontSize(size)
    return width
  }
  /** The label line stops short of the heat & lane column, or of the result block without one. */
  function textRight(row: RosterSummaryPdfRow): number {
    const heatLane = heatLaneWidth(row)
    return resultLeft(row) - (heatLane > 0 ? heatLane + M.heatLaneGap : 0)
  }

  function setType(style: "normal" | "bold", size: number, color: RGB = INK) {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }

  /** Text cut to `maxWidth` with an ellipsis, in the current font (plus any letter spacing). */
  function fit(value: string, maxWidth: number, charSpace = 0): string {
    const t = pdfText(value)
    const width = (s: string) => doc.getTextWidth(s) + s.length * charSpace
    if (maxWidth <= 0) return ""
    if (width(t) <= maxWidth) return t
    let cut = t
    while (cut.length > 0 && width(`${cut}…`) > maxWidth) cut = cut.slice(0, -1)
    return `${cut.trimEnd()}…`
  }

  /**
   * Text a touch heavier than regular — Helvetica has no medium weight, so a hairline stroke
   * in the text's own color thickens the regular glyphs (like the web's font-medium names).
   */
  function mediumText(value: string, x: number, baseline: number) {
    doc.setDrawColor(doc.getTextColor())
    doc.setLineWidth(MEDIUM_STROKE)
    doc.text(value, x, baseline, { renderingMode: "fillThenStroke", charSpace: MEDIUM_CHAR_SPACE })
  }

  function mediumTextWidth(value: string): number {
    return doc.getTextWidth(value) + value.length * MEDIUM_CHAR_SPACE
  }

  /** Baseline that vertically centers `size` text in a box starting at `top`. */
  function centeredBaseline(top: number, height: number, size: number): number {
    return top + height / 2 + size * 0.35
  }

  /** Baseline for smaller `size` text beside the label, centered on the label's capitals. */
  function besideLabel(labelBaseline: number, size: number): number {
    return labelBaseline - (M.labelSize - size) * 0.35
  }

  function badge(number: number, x: number, top: number, size: number, textSize: number): number {
    setType("bold", textSize, ACCENT)
    // Two-digit numbers stay circles; three digits stretch into a pill.
    const width = Math.max(size, doc.getTextWidth(String(number)) + px(6))
    doc.setDrawColor(...ACCENT_BORDER)
    doc.setFillColor(...ACCENT_BG)
    doc.setLineWidth(0.75)
    doc.roundedRect(x, top, width, size, size / 2, size / 2, "FD")
    doc.text(String(number), x + width / 2, centeredBaseline(top, size, textSize), { align: "center" })
    return width
  }

  /** Lines the relay legs take: two legs to a line. */
  function legsLineCount(row: RosterSummaryPdfRow): number {
    return Math.ceil((row.legs?.length ?? 0) / 2)
  }

  /**
   * Relay legs in a two-column grid, each name after its stroke (medley) or leg number:
   * "BK Sara Ukic   BR Piper Slorahn" / "FL Anna Johannessen   FR Tara Wong".
   */
  function drawLegs(row: RosterSummaryPdfRow, x: number, top: number, width: number) {
    const legs = row.legs ?? []
    const tags = medleyRows.has(row) && legs.length === MEDLEY_STROKES.length ? MEDLEY_STROKES : null
    const cellWidth = width / 2
    legs.forEach((leg, i) => {
      const cellLeft = x + (i % 2) * cellWidth
      const baseline = centeredBaseline(top + Math.floor(i / 2) * M.metaLh, M.metaLh, M.metaSize)
      setType("bold", M.seedTagSize, INK_TERTIARY)
      doc.text(tags?.[i] ?? String(i + 1), cellLeft, baseline, { charSpace: px(0.5) })
      setType("normal", M.metaSize, INK_SECONDARY)
      const nameLeft = cellLeft + M.legTagWidth
      doc.text(fit(rosterNameFirstLast(leg), cellWidth - M.legTagWidth - px(8)), nameLeft, baseline)
    })
  }

  function rowTextLeft(row: RosterSummaryPdfRow): number {
    // A fixed column wide enough for the tall badge, so labels line up across rows.
    return row.eventNumber ? left + M.badgeSize + M.badgeGap : left
  }

  /** Where the label (and sub) end, in the label line's fonts. */
  function labelEnd(row: RosterSummaryPdfRow): number {
    const textLeft = rowTextLeft(row)
    setType("normal", M.labelSize)
    let end = textLeft + Math.min(doc.getTextWidth(pdfText(row.label)), textRight(row) - textLeft)
    if (row.sub) {
      setType("normal", M.subSize)
      end += px(6) + doc.getTextWidth(pdfText(row.sub))
    }
    return end
  }

  /**
   * The meta line rides on the label line when it fits there whole, else gets its own line — as it
   * always does beside a start time, which makes a second line anyway.
   */
  function metaInline(row: RosterSummaryPdfRow): boolean {
    if (!row.meta || row.startTime) return false
    setType("normal", M.metaSize)
    return labelEnd(row) + M.inlineMetaGap + doc.getTextWidth(pdfText(row.meta)) <= textRight(row)
  }

  /**
   * The meta when it gets lines of its own. Beside the start time it stops short of the heat & lane
   * column and wraps onto a second line rather than lose its end (a relay leg's split); otherwise it
   * runs to the column edge on one line.
   */
  function metaLines(row: RosterSummaryPdfRow): string[] {
    if (!row.meta || metaInline(row)) return []
    const textLeft = rowTextLeft(row)
    setType("normal", M.metaSize)
    if (!row.startTime) return [fit(row.meta, right - textLeft)]
    const width = textRight(row) - textLeft
    // Wrap between the " | " parts ("Timed Finals" / "Leg 2 · 25.31"), not inside one.
    const lines: string[] = []
    for (const part of pdfText(row.meta).split(" | ")) {
      const joined = lines.length ? `${lines[lines.length - 1]} | ${part}` : part
      if (lines.length && doc.getTextWidth(joined) <= width) lines[lines.length - 1] = joined
      else lines.push(part)
    }
    return lines.length <= 2
      ? lines.map((line) => fit(line, width))
      : [fit(lines[0], width), fit(lines.slice(1).join(" | "), width)]
  }

  /** Lines under the label: the meta (whose first line the start time shares), then the legs. */
  function linesBelow(row: RosterSummaryPdfRow): number {
    return Math.max(metaLines(row).length, row.startTime ? 1 : 0) + legsLineCount(row)
  }

  function rowHeight(row: RosterSummaryPdfRow): number {
    return M.rowPadY * 2 + M.labelLh + linesBelow(row) * M.metaLh
  }

  function drawResult(result: RosterSummaryPdfResult, baseline: number) {
    const deltaRight = right - M.placeWidth - M.timeWidth
    const timeRight = right - M.placeWidth
    if (result.kind === "done") {
      if (result.delta) {
        const faster = result.delta.startsWith("-")
        setType("bold", M.smallSize, faster ? FASTER : SLOWER)
        doc.text(pdfText(result.delta), deltaRight, baseline, { align: "right" })
      }
      if (result.time) {
        setType("bold", M.timeSize)
        doc.text(pdfText(formatDisplayTime(result.time)), timeRight, baseline, { align: "right" })
      } else {
        setType("bold", M.timeSize, STATUS)
        doc.text(pdfText(result.status ?? "—"), timeRight, baseline, { align: "right" })
      }
      if (result.place != null) {
        const podium = result.podium && result.place <= 3 ? PODIUM[result.place] : undefined
        setType(podium ? "bold" : "normal", M.smallSize, podium ?? INK_SECONDARY)
        doc.text(formatOrdinal(result.place), right, baseline, { align: "right" })
      }
    } else if (result.kind === "seed") {
      setType("bold", M.seedTagSize, INK_TERTIARY)
      doc.text("SEED", deltaRight, baseline, { align: "right", charSpace: px(1) })
      setType("normal", M.timeSize, INK_SECONDARY)
      const seed = result.seed === "NT" ? "NT" : formatDisplayTime(result.seed)
      doc.text(pdfText(seed), timeRight, baseline, { align: "right" })
      if (result.seedRank != null) {
        setType("normal", M.smallSize, INK_TERTIARY)
        doc.text(formatOrdinal(result.seedRank), right, baseline, { align: "right" })
      }
    } else if (result.kind === "text") {
      setType("normal", M.smallSize, INK_SECONDARY)
      doc.text(fit(result.text, RIGHT_WIDTH), right, baseline, { align: "right" })
    } else {
      setType("normal", M.timeSize, INK_TERTIARY)
      doc.text("—", timeRight, baseline, { align: "right" })
    }
  }

  function drawRow(row: RosterSummaryPdfRow, top: number) {
    const textLeft = rowTextLeft(row)
    const maxText = textRight(row) - textLeft
    // Lines under the label run beneath the result block, out to the column edge.
    const maxBelow = right - textLeft
    const labelTop = top + M.rowPadY
    const topBaseline = centeredBaseline(labelTop, M.labelLh, M.labelSize)
    // With nothing under it but the start time (in the heat & lane column), the label line — label,
    // sub, result — centers on the row like the event badge.
    const centered = Boolean(row.startTime) && metaLines(row).length === 0 && legsLineCount(row) === 0
    // The result centers on the label line and the start time's line either way, like the badge.
    const twoLineBaseline = centeredBaseline(labelTop, M.labelLh + M.metaLh, M.labelSize)
    const baseline = centered ? twoLineBaseline : topBaseline
    const resultBaseline = row.startTime ? twoLineBaseline : baseline
    if (row.eventNumber) {
      // Centered on the label and the line under it when there is one; on the label otherwise.
      const twoLines = linesBelow(row) > 0
      const span = twoLines ? M.labelLh + M.metaLh : M.labelLh
      badge(row.eventNumber, left, labelTop + (span - M.badgeSize) / 2, M.badgeSize, M.badgeTextSize)
    }
    setType("normal", M.labelSize)
    const label = fit(row.label, maxText)
    doc.text(label, textLeft, baseline)
    if (row.sub) {
      const labelWidth = doc.getTextWidth(label)
      setType("normal", M.subSize, INK_TERTIARY)
      const subLeft = textLeft + labelWidth + px(6)
      doc.text(fit(row.sub, textRight(row) - subLeft), subLeft, besideLabel(baseline, M.subSize))
    }
    if (row.result) drawResult(row.result, resultBaseline)

    let lineTop = labelTop + M.labelLh
    const metaBaseline = centeredBaseline(lineTop, M.metaLh, M.metaSize)
    if (row.heatLane) {
      setType("normal", M.metaSize, INK_SECONDARY)
      doc.text(pdfText(row.heatLane), resultLeft(row), topBaseline, { align: "right" })
    }
    if (row.startTime) {
      setType("normal", M.metaSize, INK_TERTIARY)
      doc.text(pdfText(row.startTime), resultLeft(row), metaBaseline, { align: "right" })
    }
    if (row.meta && metaInline(row)) {
      // Measure before styling: labelEnd switches to the label's fonts.
      const metaLeft = labelEnd(row) + M.inlineMetaGap
      setType("normal", M.metaSize, INK_TERTIARY)
      doc.text(pdfText(row.meta), metaLeft, besideLabel(baseline, M.metaSize))
    }
    const lines = metaLines(row)
    setType("normal", M.metaSize, INK_TERTIARY)
    lines.forEach((line, i) => {
      doc.text(line, textLeft, centeredBaseline(lineTop + i * M.metaLh, M.metaLh, M.metaSize))
    })
    lineTop += Math.max(lines.length, row.startTime ? 1 : 0) * M.metaLh
    drawLegs(row, textLeft, lineTop, maxBelow)
  }

  function drawSectionHeader(section: RosterSummaryPdfSection, top: number, continued: boolean) {
    let x = left
    if (section.eventNumber) {
      x += badge(section.eventNumber, x, top + (M.sectionHeaderHeight - M.badgeSize) / 2, M.badgeSize, M.badgeTextSize)
      x += M.badgeGap
    }
    setType("normal", M.sectionTitleSize)
    const baseline = centeredBaseline(top, M.sectionHeaderHeight, M.sectionTitleSize)
    const suffix = continued ? " (cont.)" : ""
    const title = fit(`${section.title}${suffix}`, right - x, MEDIUM_CHAR_SPACE)
    if (suffix && title === pdfText(`${section.title}${suffix}`)) {
      const name = pdfText(section.title)
      mediumText(name, x, baseline)
      doc.setTextColor(...INK_SECONDARY)
      doc.text(suffix, x + mediumTextWidth(name), baseline)
    } else {
      mediumText(title, x, baseline)
    }
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.75)
    doc.line(left, top + M.sectionHeaderHeight, right, top + M.sectionHeaderHeight)
  }

  doc.setProperties({
    title: meetFileName(rosterSummaryPdfLabel(request), input.meetName),
    author: "SwimBuzz",
    creator: "SwimBuzz",
  })

  // Header: the gold heading, meet name, and date & location, beside an icon as tall as all three.
  setType("bold", M.titleSize)
  // Visible gaps around the meet name: from the heading's baseline to the name's capitals, and a
  // touch more from the name's baseline to the details' capitals and digits. The icon spans the
  // heading's capitals to the details' baseline, reaching a little past both.
  const headerHeight = (titleLineCount: number) =>
    M.eyebrowSize * HELVETICA_CAP_HEIGHT +
    M.titleGapAbove +
    M.titleSize * HELVETICA_CAP_HEIGHT +
    (titleLineCount - 1) * M.titleLh +
    M.titleGapBelow +
    M.detailsSize * HELVETICA_CAP_HEIGHT
  const splitTitle = (left: number) => doc.splitTextToSize(pdfText(input.meetName), pageRight - left) as string[]
  let iconSize = 0
  let titleLines: string[] = []
  if (input.iconPng) {
    // A taller icon leaves the title less room, and a wrapped title makes the icon taller:
    // grow them together until the title's line count settles.
    let lineCount = 1
    for (let pass = 0; pass < 5; pass++) {
      iconSize = headerHeight(lineCount) + M.iconOvershoot * 2
      titleLines = splitTitle(pageLeft + iconSize + M.iconGap)
      if (titleLines.length === lineCount) break
      lineCount = titleLines.length
    }
    try {
      doc.addImage(input.iconPng, "PNG", pageLeft, M.margin - M.iconOvershoot, iconSize, iconSize)
    } catch {
      // Unreadable image: leave the icon out.
      iconSize = 0
    }
  }
  const headerX = iconSize ? pageLeft + iconSize + M.iconGap : pageLeft
  if (!iconSize) titleLines = splitTitle(pageLeft)
  setType("bold", M.eyebrowSize, ACCENT)
  let baseline = M.margin + M.eyebrowSize * HELVETICA_CAP_HEIGHT
  const charSpace = px(1.5)
  const heading = (request.heading ?? "Entries").toUpperCase()
  doc.text(fit(heading, pageRight - headerX, charSpace), headerX, baseline, { charSpace })
  setType("bold", M.titleSize)
  baseline += M.titleGapAbove + M.titleSize * HELVETICA_CAP_HEIGHT
  titleLines.forEach((line, index) => {
    if (index > 0) baseline += M.titleLh
    doc.text(line, headerX, baseline)
  })
  baseline += M.titleGapBelow + M.detailsSize * HELVETICA_CAP_HEIGHT
  const details = {
    date: pdfText(input.details.date),
    location: input.details.location && pdfText(input.details.location),
  }
  drawMeetPdfDetails(doc, details, headerX, baseline, pageRight - headerX, M.detailsSize, INK_SECONDARY)
  let y = baseline + M.headerGap

  if (request.sections.length === 0) {
    setType("normal", M.labelSize, INK_TERTIARY)
    doc.text("No entries match these filters.", pageLeft, y + M.labelSize)
  }

  // ---- flow: sections fill two columns, left then right, page by page ----

  /** Rows [startRow, endRow) of a section; startRow > 0 continues it under a "(cont.)" title. */
  type Piece = { section: RosterSummaryPdfSection; startRow: number; endRow: number }
  const fullColumn = contentBottom - M.margin

  function setColumn(index: 0 | 1) {
    left = pageLeft + index * (columnWidth + M.columnGap)
    right = left + columnWidth
  }

  // Every row is laid out at column width, so its height is measured once.
  const heights = new Map<RosterSummaryPdfRow, number>()
  function measuredRowHeight(row: RosterSummaryPdfRow): number {
    let height = heights.get(row)
    if (height == null) heights.set(row, (height = rowHeight(row)))
    return height
  }

  function pieceHeight(piece: Piece): number {
    let height = M.sectionHeaderHeight
    for (let i = piece.startRow; i < piece.endRow; i++) height += measuredRowHeight(piece.section.rows[i])
    return height
  }

  function drawStack(pieces: Piece[], top: number): number {
    let yy = top
    pieces.forEach((piece, i) => {
      if (i > 0) yy += M.sectionGap
      drawSectionHeader(piece.section, yy, piece.startRow > 0)
      yy += M.sectionHeaderHeight
      for (let r = piece.startRow; r < piece.endRow; r++) {
        if (r > piece.startRow) {
          doc.setDrawColor(...BORDER)
          doc.setLineWidth(0.5)
          doc.line(left, yy, right, yy)
        }
        const row = piece.section.rows[r]
        drawRow(row, yy)
        yy += measuredRowHeight(row)
      }
    })
    return yy
  }

  /**
   * Pieces off the front of `queue` that fit in `avail` of one column. A section that would fit in a
   * whole column moves on rather than split (unless `splitSections`); a longer one splits, never
   * leaving its title without a row.
   */
  function takeColumn(queue: Piece[], avail: number): [Piece[], Piece[]] {
    const taken: Piece[] = []
    let used = 0
    for (let i = 0; i < queue.length; i++) {
      const piece = queue[i]
      const gap = taken.length > 0 ? M.sectionGap : 0
      const height = pieceHeight(piece)
      if (used + gap + height <= avail) {
        taken.push(piece)
        used += gap + height
        continue
      }
      if (!request.splitSections && height <= fullColumn) return [taken, queue.slice(i)]
      let end = piece.startRow
      let rowsHeight = 0
      const room = avail - used - gap - M.sectionHeaderHeight
      while (end < piece.endRow && rowsHeight + measuredRowHeight(piece.section.rows[end]) <= room) {
        rowsHeight += measuredRowHeight(piece.section.rows[end])
        end += 1
      }
      if (end === piece.startRow) return [taken, queue.slice(i)]
      taken.push({ ...piece, endRow: end })
      return [taken, [{ ...piece, startRow: end }, ...queue.slice(i + 1)]]
    }
    return [taken, []]
  }

  /** Lay out sections in two columns from `top`; returns the y below them. */
  function flowColumns(sections: RosterSummaryPdfSection[], top: number): number {
    setColumn(0)
    let queue: Piece[] = sections.map((section) => ({ section, startRow: 0, endRow: section.rows.length }))
    let yy = top
    while (queue.length > 0) {
      setColumn(0)
      const avail = contentBottom - yy
      // Fill the left column, then the right, then go on to the next page.
      const [first, afterFirst] = takeColumn(queue, avail)
      const firstBottom = drawStack(first, yy)
      setColumn(1)
      const [second, rest] = takeColumn(afterFirst, avail)
      const secondBottom = drawStack(second, yy)
      queue = rest
      if (queue.length === 0) return Math.max(firstBottom, secondBottom)
      doc.addPage()
      yy = M.margin
    }
    return yy
  }

  y = flowColumns(request.sections, y)

  // Footer on every page: meet name, then "n / N".
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    setType("normal", M.footerSize, INK_TERTIARY)
    doc.text(fit(input.meetName, pageRight - pageLeft - px(80)), pageLeft, footerTop)
    doc.text(`${page} / ${pages}`, pageRight, footerTop, { align: "right" })
  }

  return doc
}

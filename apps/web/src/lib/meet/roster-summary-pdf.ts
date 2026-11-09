import { jsPDF } from "jspdf"
import {
  MEET_HEADER,
  ROSTER_SUMMARY_PDF_LIMITS,
  coerceMeetHighlights,
  coerceMeetRecords,
  coerceMeetWins,
  coerceTopScorers,
  highlightTileRows,
  isDropCounterValue,
  meetFileName,
  rosterNameFirstLast,
  rosterNamePreferred,
  rosterSummaryExportSections,
  rosterSummaryPdfLabel,
  type IconName,
  type RosterSummaryHighlights,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfResult,
  type RosterSummaryPdfRow,
  type RosterSummaryPdfSection,
  type RosterSummaryPdfSplit,
  type MeetHeaderDetails,
  type StatCounter,
} from "@swimbuzz/shared"
import { formatDisplayTime, formatOrdinal } from "@/lib/utils"
import { HELVETICA_CAP_HEIGHT, SEMIBOLD_CHAR_SPACE, drawMeetPdfDetails, semiboldText } from "@/lib/meet/meet-pdf-details"
import { drawPdfIcon } from "@/lib/meet/pdf-icon"
import { cleanEventName } from "@/lib/meet/meet-event-order"
import type { EventOrderWithHeats } from "@/lib/meet/event-heats"

export type RosterSummaryPdfInput = {
  meetName: string
  /** Date and location (with the school), under the meet name. */
  details: MeetHeaderDetails
  /** Meet icon as a square PNG (logo fitted whole, transparent padding), or null to leave it out. */
  iconPng: Uint8Array | null
  request: RosterSummaryPdfRequest
  /** The meet's order of events (already narrowed to the view's session) to draw under the header. */
  eventOrder?: EventOrderWithHeats | null
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
const BORDER_SUBTLE: RGB = [228, 228, 231]
const WHITE: RGB = [255, 255, 255]
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
  /** Below the meet's name and details, a little more than between the blocks under it. */
  meetHeaderGap: px(20),
  sectionGap: px(10),
  sectionHeaderHeight: px(26),
  sectionTitleSize: px(14),
  // A highlights export's few long lists stand further apart.
  highlightsSectionGap: px(24),
  /** A section's icon, as a share of the event badge's room it takes. */
  badgeIconScale: 0.8,
  // A subsection's caps heading ("WOMEN"), set on the bottom of its row like a label over a list.
  subheadingHeight: px(28),
  subheadingPadBottom: px(6),
  subheadingSize: px(10),
  subheadingCharSpace: px(1),
  // A row's round after its label ("FINALS"), the subheading's gold caps a little smaller.
  roundSize: px(9),
  roundCharSpace: px(0.8),
  roundGap: px(7),
  // Every event circle is the same size, here and in the relays PDF and PNG.
  badgeSize: px(21),
  badgeTextSize: px(10.5),
  badgeGap: px(6),
  /** A leading podium place's column ("2nd"), before the label like a badge. */
  leadPlaceWidth: px(26),
  rowPadY: px(3),
  labelLh: px(18),
  labelSize: px(13),
  subSize: px(11),
  inlineMetaGap: px(6),
  metaLh: px(13),
  metaSize: px(11),
  /** Room for a relay leg's stroke or number ("BK", "2") before the swimmer's name. */
  legTagWidth: px(20),
  /** A new Nationals cut's line under the athlete: room for a result-size time. */
  cutLh: px(17),
  /** The cut after a new Nationals cut's time ("11:39.99"), right-aligned to the column edge. */
  cutWidth: px(54),
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
  // Order of events: sessions two across, in the half-page columns the sections use.
  orderMaxColumns: 2,
  orderGap: px(10),
  orderRadius: px(8),
  // Column heads and rows take the PDF's "SEED" tag and row label sizes.
  orderSessionHeight: px(28),
  orderSessionSize: px(11),
  orderHeadHeight: px(20),
  orderRowHeight: px(21),
  orderNumberWidth: px(40),
  orderPadX: px(10),
  /** From the WOMEN / MEN head to the HEATS head beside it. */
  orderHeatsGap: px(12),
  /** A lone session's table, centered: this much wider than a half-page column. */
  orderSoloScale: 1.15,
  // Highlights: rows of tiles across the page, like the meet page's carousel.
  tileGap: px(8),
  tileRadius: px(8),
  tilePadX: px(8),
  tilePadY: px(6),
  tileValueSize: px(18),
  /** The smallest a long value (a name) shrinks to before it's cut short. */
  tileValueMinSize: px(12),
  tileValueLh: px(22),
  /** A wrapped value's line height, at the floor size. */
  tileValueMinLh: px(15),
  tileLabelLh: px(13),
  /** A wrapped label's further lines. */
  tileLabelWrapLh: px(11),
}

const RIGHT_WIDTH = M.deltaWidth + M.timeWidth + M.placeWidth

/** Medley relay legs in swim order. */
const MEDLEY_STROKES = ["BK", "BR", "FL", "FR"]

/** An individual swim's splits go four to a line, where relay legs go two. */
const SPLITS_PER_LINE = 4
/** The first split column's indent under the name, and the gap between a column and the next. */
const SPLIT_INDENT = px(12)
const SPLIT_GAP = px(18)
/** Letter in points, how far a one-page export may shrink or grow it, and how closely it fits. */
const LETTER_WIDTH = 612
const LETTER_HEIGHT = 792
const ONE_PAGE_MIN_SCALE = 0.75
const ONE_PAGE_MAX_SCALE = 4
const ONE_PAGE_PRECISION = 0.01


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
    return t ? { kind: "text", text: t, ...(r.strong === true ? { strong: true } : {}) } : { kind: "none" }
  }
  return { kind: "none" }
}

/** Interval splits in distance order, leaving out any without a distance or a time ("No Data"). */
function parseSplits(value: unknown): RosterSummaryPdfSplit[] | undefined {
  if (!Array.isArray(value)) return undefined
  const splits = value
    .slice(0, ROSTER_SUMMARY_PDF_LIMITS.splits)
    .map((raw) => {
      const s = (raw ?? {}) as Record<string, unknown>
      return { distance: positiveInt(s.distance), time: text(s.time) }
    })
    .filter((s): s is RosterSummaryPdfSplit => s.distance != null && s.time != null && /\d/.test(s.time))
    .sort((a, b) => a.distance - b.distance)
  // A lone split is just the swim's time again.
  return splits.length > 1 ? splits : undefined
}

function parseRow(value: unknown): RosterSummaryPdfRow | null {
  const r = (value ?? {}) as Record<string, unknown>
  const label = text(r.label)
  if (!label) return null
  // Legs and their splits stay paired, so a leg without a name drops its split with it.
  const splits = Array.isArray(r.legSplits) ? r.legSplits : []
  const pairs = Array.isArray(r.legs)
    ? r.legs
        .slice(0, ROSTER_SUMMARY_PDF_LIMITS.legs)
        .map((leg, i) => ({ name: text(leg), split: text(splits[i]) ?? "" }))
        .filter((pair): pair is { name: string; split: string } => Boolean(pair.name))
    : []
  const legs = pairs.map((pair) => pair.name)
  const legSplits = pairs.some((pair) => pair.split) ? pairs.map((pair) => pair.split) : undefined
  // A subsection's heading is only its label.
  if (r.subheading === true) return { subheading: true, label }
  return {
    eventNumber: positiveInt(r.eventNumber),
    label,
    fullLabel: text(r.fullLabel),
    round: text(r.round),
    sub: text(r.sub),
    meta: text(r.meta),
    heatLane: text(r.heatLane),
    startTime: text(r.startTime),
    legs: legs.length ? legs : undefined,
    legSplits,
    splits: parseSplits(r.splits),
    result: r.result == null ? undefined : parseResult(r.result),
  }
}

/** The meet's highlights a Results export carries, trimmed to the limits, or undefined for none. */
function parseHighlights(value: unknown): RosterSummaryHighlights | undefined {
  const raw = (value ?? {}) as Record<string, unknown>
  const highlights = coerceMeetHighlights({
    counters: Array.isArray(raw.counters) ? raw.counters.slice(0, ROSTER_SUMMARY_PDF_LIMITS.counters) : null,
    newNationalsCuts: Array.isArray(raw.newNationalsCuts)
      ? raw.newNationalsCuts.slice(0, ROSTER_SUMMARY_PDF_LIMITS.newNationalsCuts)
      : null,
  })
  if (!highlights) return undefined
  const counters = highlights.counters.flatMap((c) => {
    const label = text(c.label)
    const value = text(String(c.value))
    return label && value ? [{ ...c, label, value, hint: text(c.hint), detail: text(c.detail) }] : []
  })
  const newNationalsCuts = (highlights.newNationalsCuts ?? []).flatMap((c) => {
    const [athleteName, event, time, cut, delta] = [c.athleteName, c.event, c.time, c.cut, c.delta].map(text)
    return athleteName && event && time && cut && delta
      ? [{ athleteId: text(c.athleteId), athleteName, gender: c.gender, event, time, cut, delta }]
      : []
  })
  const topScorers = coerceTopScorers(
    Array.isArray(raw.topScorers) ? raw.topScorers.slice(0, ROSTER_SUMMARY_PDF_LIMITS.topScorers) : null
  ).flatMap((c) => {
    const [athleteName, points] = [c.athleteName, c.points].map(text)
    const rank = positiveInt(c.rank)
    return athleteName && points && rank ? [{ rank, athleteName, points, events: c.events }] : []
  })
  const wins = coerceMeetWins(
    Array.isArray(raw.wins) ? raw.wins.slice(0, ROSTER_SUMMARY_PDF_LIMITS.wins) : null
  ).flatMap((w) => {
    const [event, time] = [w.event, w.time].map(text)
    const legs = (w.legs ?? []).slice(0, ROSTER_SUMMARY_PDF_LIMITS.legs).map(text).filter((leg): leg is string => Boolean(leg))
    return event && time
      ? [{ gender: w.gender, event, athleteName: text(w.athleteName), legs, time, delta: text(w.delta), place: w.place }]
      : []
  })
  const records = coerceMeetRecords(
    Array.isArray(raw.records) ? raw.records.slice(0, ROSTER_SUMMARY_PDF_LIMITS.records) : null
  ).flatMap((r) => {
    const [event, time] = [r.event, r.time].map(text)
    const swimmers = r.swimmers.slice(0, ROSTER_SUMMARY_PDF_LIMITS.legs).map((name) => text(name) ?? "")
    const previous = r.previous && text(r.previous.time)
      ? { time: text(r.previous.time)!, year: r.previous.year, holder: text(r.previous.holder) }
      : undefined
    return event && time ? [{ gender: r.gender, event, swimmers, leadoff: r.leadoff, time, previous }] : []
  })
  return counters.length > 0 ? { counters, newNationalsCuts, topScorers, wins, records } : undefined
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
    sections.push({ title, sub: text(s.sub), eventNumber: positiveInt(s.eventNumber), rows })
  }
  const order = b.orderOfEvents && typeof b.orderOfEvents === "object" ? (b.orderOfEvents as Record<string, unknown>) : null
  const highlights = parseHighlights(b.highlights)
  return {
    heading: text(b.heading),
    sections,
    splitSections: b.splitSections === true,
    ...(order ? { orderOfEvents: { session: text(order.session) } } : {}),
    ...(highlights ? { highlights } : {}),
    ...(b.fitOnePage === true ? { fitOnePage: true } : {}),
  }
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
 * each section's title (with its event badge) and rows: the label, a meta line, relay legs or a swim's
 * splits, the heat & lane over the start time, and the time, delta and place (or seed and seed rank)
 * on the right. A section that fits in one column never splits; a longer one continues in the next
 * column under a repeated title. A highlights export (`highlights`, `fitOnePage`) draws the tiles
 * under the header, then its sections, all on one page.
 */
export function buildRosterSummaryPdf(input: RosterSummaryPdfInput): jsPDF {
  if (!input.request.fitOnePage) return layoutRosterSummaryPdf(input, 1)
  // One page however long or short the lists: the smallest page of Letter's proportions they fit
  // on, so they fill it — it prints scaled to Letter. A larger page always has more room, so
  // bisect between the smallest and largest.
  let fitting = layoutRosterSummaryPdf(input, ONE_PAGE_MIN_SCALE)
  if (fitting.getNumberOfPages() === 1) return fitting
  fitting = layoutRosterSummaryPdf(input, ONE_PAGE_MAX_SCALE)
  if (fitting.getNumberOfPages() > 1) return fitting
  let low = ONE_PAGE_MIN_SCALE
  let high = ONE_PAGE_MAX_SCALE
  while (high - low > ONE_PAGE_PRECISION) {
    const scale = (low + high) / 2
    const doc = layoutRosterSummaryPdf(input, scale)
    if (doc.getNumberOfPages() === 1) {
      high = scale
      fitting = doc
    } else {
      low = scale
    }
  }
  return fitting
}

/** `buildRosterSummaryPdf` on a page `scale` times Letter's size. */
function layoutRosterSummaryPdf(input: RosterSummaryPdfInput, scale: number): jsPDF {
  // A highlights export's top scorers, top performances and new Nationals cuts lead the sections.
  const request = withPreferredNames({ ...input.request, sections: rosterSummaryExportSections(input.request) })
  // Medley relay rows, by their own label ("200 Medley A") or their event's title ("Relay A").
  const medleyRows = new Set(
    request.sections.flatMap((section) =>
      section.rows.filter((row) => /\bmedley\b/i.test(`${section.title} ${row.label}`))
    )
  )
  const highlightsExport = Boolean(request.highlights)
  const sectionGap = highlightsExport ? M.highlightsSectionGap : M.sectionGap
  const doc = new jsPDF({
    unit: "pt",
    format: scale === 1 ? "letter" : [LETTER_WIDTH * scale, LETTER_HEIGHT * scale],
    orientation: "portrait",
  })
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
  const resultLeft = (row: RosterSummaryPdfRow) => (row.result ? right - resultWidth(row.result) - M.rightGap : right)
  /**
   * The result block's width: a plain-text result ("1:34.91", "60 pts") only as wide as its text, so
   * a long label beside it ("Women 200 Medley Relay") keeps its room; anything else the full block.
   * Measures without disturbing the current font, since callers measure around it.
   */
  function resultWidth(result: RosterSummaryPdfResult): number {
    if (result.kind !== "text") return RIGHT_WIDTH
    const font = doc.getFont()
    const size = doc.getFontSize()
    doc.setFont("helvetica", "normal")
    doc.setFontSize(result.strong ? M.timeSize : M.smallSize)
    // Measured like semiboldText draws it: its letter spacing widens a strong result.
    const value = pdfText(result.text)
    const width = doc.getTextWidth(value) + (result.strong ? Math.max(0, value.length - 1) * SEMIBOLD_CHAR_SPACE : 0)
    doc.setFont(font.fontName, font.fontStyle)
    doc.setFontSize(size)
    return Math.min(RIGHT_WIDTH, width)
  }
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
  /**
   * The label line stops short of the heat & lane column, or of the result block without one.
   * `fullResult` measures to the full result block, even beside a narrow plain-text result — where
   * the meta may ride on the label line, so that stays the same whatever the result's length.
   */
  function textRight(row: RosterSummaryPdfRow, fullResult = false): number {
    const heatLane = heatLaneWidth(row)
    const left = fullResult && row.result ? right - RIGHT_WIDTH - M.rightGap : resultLeft(row)
    return left - (heatLane > 0 ? heatLane + M.heatLaneGap : 0)
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

  /** A gold icon where an event badge would go, without the badge's circle. */
  function iconBadge(name: IconName, x: number, top: number, size: number): number {
    const iconSize = size * M.badgeIconScale
    drawPdfIcon(doc, name, x + (size - iconSize) / 2, top + (size - iconSize) / 2, iconSize, ACCENT)
    return size
  }

  /** Lines the relay legs take: two legs to a line. */
  function legsLineCount(row: RosterSummaryPdfRow): number {
    return Math.ceil((row.legs?.length ?? 0) / 2)
  }

  /**
   * Relay legs in a two-column grid, each name after its stroke (medley) or leg number and before
   * its split: "BK Sara Ukic 28.41   BR Piper Slorahn 31.02" / "FL Anna Johannessen   FR Tara Wong".
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
      const nameLeft = cellLeft + M.legTagWidth
      const room = cellWidth - M.legTagWidth - px(8)
      const split = row.legSplits?.[i] ? pdfText(row.legSplits[i]) : ""
      setType("normal", M.metaSize, INK_TERTIARY)
      const splitWidth = split ? doc.getTextWidth(split) + px(6) : 0
      setType("normal", M.metaSize, INK_SECONDARY)
      const name = fit(rosterNameFirstLast(leg), room - splitWidth)
      doc.text(name, nameLeft, baseline)
      if (split) {
        const splitLeft = nameLeft + doc.getTextWidth(name) + px(6)
        setType("normal", M.metaSize, INK_TERTIARY)
        doc.text(split, splitLeft, baseline)
      }
    })
  }

  /** Lines an individual swim's splits take: four to a line. */
  function splitsLineCount(row: RosterSummaryPdfRow): number {
    return Math.ceil((row.splits?.length ?? 0) / SPLITS_PER_LINE)
  }

  /**
   * An individual swim's interval splits as times alone, four to a line and muted like a relay leg's
   * split, each right-aligned at an even, compact spacing so the decimals line up down the columns —
   * the way a meet results file sets them, the first a little in from the name.
   */
  function drawSplits(row: RosterSummaryPdfRow, x: number, top: number, width: number) {
    const times = (row.splits ?? []).map((split) => pdfText(formatDisplayTime(split.time)))
    if (times.length === 0) return
    setType("normal", M.metaSize, INK_TERTIARY)
    // Columns sit where a minute-long split would fit, so they line up from row to row, and never
    // spread past the row's edge.
    const columnWidth = doc.getTextWidth("1:00.00")
    const firstRight = x + SPLIT_INDENT + columnWidth
    const pitch = Math.min(columnWidth + SPLIT_GAP, (x + width - firstRight) / (SPLITS_PER_LINE - 1))
    times.forEach((time, i) => {
      const baseline = centeredBaseline(top + Math.floor(i / SPLITS_PER_LINE) * M.metaLh, M.metaLh, M.metaSize)
      doc.text(time, firstRight + (i % SPLITS_PER_LINE) * pitch, baseline, { align: "right" })
    })
  }

  /** Lines an athlete's new Nationals cuts take: one each. */
  function cutsLineCount(row: RosterSummaryPdfRow): number {
    return row.cuts?.length ?? 0
  }

  /**
   * An athlete's new Nationals cuts, a line each: the event, then the margin under the cut and the
   * time set like a result row's so they read as results, and the cut itself after the time,
   * quieter.
   */
  function drawCuts(row: RosterSummaryPdfRow, x: number, top: number) {
    const cuts = row.cuts ?? []
    if (cuts.length === 0) return
    const timeRight = right - M.cutWidth
    const deltaRight = timeRight - M.timeWidth
    cuts.forEach((cut, i) => {
      const baseline = centeredBaseline(top + i * M.cutLh, M.cutLh, M.metaSize)
      setType("normal", M.metaSize, INK_SECONDARY)
      doc.text(fit(cut.event, deltaRight - M.deltaWidth - x), x, baseline)
      setType("bold", M.smallSize, cut.delta.startsWith("-") ? FASTER : SLOWER)
      doc.text(pdfText(cut.delta), deltaRight, baseline, { align: "right" })
      setType("normal", M.timeSize)
      semiboldText(doc, pdfText(formatDisplayTime(cut.time)), timeRight, baseline, "right")
      setType("normal", M.smallSize, INK_TERTIARY)
      doc.text(pdfText(formatDisplayTime(cut.cut)), right, baseline, { align: "right" })
    })
  }

  function rowTextLeft(row: RosterSummaryPdfRow): number {
    // A fixed column wide enough for the tall badge, so labels line up across rows.
    if (row.eventNumber) return left + M.badgeSize + M.badgeGap
    return row.place ? left + M.leadPlaceWidth + M.badgeGap : left
  }

  /** Where `label` (and the row's sub) end, in the label line's fonts. */
  function labelEndWith(row: RosterSummaryPdfRow, label: string): number {
    const textLeft = rowTextLeft(row)
    setType("normal", M.labelSize)
    let end = textLeft + Math.min(doc.getTextWidth(pdfText(label)), textRight(row) - textLeft)
    if (row.round) end += M.roundGap + roundWidth(row.round)
    if (row.sub) {
      setType("normal", M.subSize)
      end += px(6) + doc.getTextWidth(pdfText(row.sub))
    }
    return end
  }

  /** A round's width in its gold caps. */
  function roundWidth(round: string): number {
    const caps = pdfText(round.toUpperCase())
    setType("bold", M.roundSize)
    return doc.getTextWidth(caps) + caps.length * M.roundCharSpace
  }

  /** A round in gold caps from `x`, on the label line; returns where it ends. */
  function drawRound(round: string, x: number, labelBaseline: number): number {
    const width = roundWidth(round)
    setType("bold", M.roundSize, ACCENT)
    doc.text(pdfText(round.toUpperCase()), x, besideLabel(labelBaseline, M.roundSize), { charSpace: M.roundCharSpace })
    return x + width
  }

  /** Whether the meta fits whole on the label line after `label`. */
  function metaFitsWith(row: RosterSummaryPdfRow, label: string): boolean {
    if (!row.meta || row.startTime) return false
    const end = labelEndWith(row, label)
    setType("normal", M.metaSize)
    return end + M.inlineMetaGap + doc.getTextWidth(pdfText(row.meta)) <= textRight(row, true)
  }

  /**
   * The full label when it fits on the line with the sub, else the compact one — and the compact one
   * too when only it leaves room for the meta beside it ("400 Free B  Leg 4" on one line rather than
   * "400 Free Relay B" over "Leg 4").
   */
  function rowLabel(row: RosterSummaryPdfRow): string {
    if (!row.fullLabel || labelEndWith(row, row.fullLabel) > textRight(row)) return row.label
    if (row.meta && !metaFitsWith(row, row.fullLabel) && metaFitsWith(row, row.label)) return row.label
    return row.fullLabel
  }

  /** Where the label (and sub) end, in the label line's fonts. */
  function labelEnd(row: RosterSummaryPdfRow): number {
    return labelEndWith(row, rowLabel(row))
  }

  /**
   * The meta line rides on the label line when it fits there whole, else gets its own line — as it
   * always does beside a start time, which makes a second line anyway.
   */
  function metaInline(row: RosterSummaryPdfRow): boolean {
    return metaFitsWith(row, rowLabel(row))
  }

  /**
   * The meta when it gets lines of its own, flush with the label. Beside the start time it stops
   * short of the heat & lane column and wraps onto a second line rather than lose its end (a relay
   * leg's split); otherwise it runs to the column edge on one line.
   */
  function metaLines(row: RosterSummaryPdfRow): string[] {
    if (!row.meta || metaInline(row)) return []
    const textLeft = rowTextLeft(row)
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

  /**
   * Lines under the label: the meta (whose first line the start time shares), then the relay legs,
   * the swim's splits or the athlete's new Nationals cuts.
   */
  function linesBelow(row: RosterSummaryPdfRow): number {
    return (
      Math.max(metaLines(row).length, row.startTime ? 1 : 0) +
      legsLineCount(row) +
      splitsLineCount(row) +
      cutsLineCount(row)
    )
  }

  function rowHeight(row: RosterSummaryPdfRow): number {
    if (row.subheading) return M.subheadingHeight
    // A cut line is taller than the others, for its result-size time.
    return M.rowPadY * 2 + M.labelLh + linesBelow(row) * M.metaLh + cutsLineCount(row) * (M.cutLh - M.metaLh)
  }

  function drawResult(result: RosterSummaryPdfResult, baseline: number) {
    // Without a place column the time runs to the edge.
    const placeWidth = result.kind === "done" && result.placeless ? 0 : M.placeWidth
    const deltaRight = right - placeWidth - M.timeWidth
    const timeRight = right - placeWidth
    if (result.kind === "done") {
      if (result.delta) {
        const faster = result.delta.startsWith("-")
        setType("bold", M.smallSize, faster ? FASTER : SLOWER)
        doc.text(pdfText(result.delta), deltaRight, baseline, { align: "right" })
      }
      if (result.time) {
        setType("normal", M.timeSize)
        semiboldText(doc, pdfText(formatDisplayTime(result.time)), timeRight, baseline, "right")
      } else {
        setType("normal", M.timeSize, STATUS)
        semiboldText(doc, pdfText(result.status ?? "—"), timeRight, baseline, "right")
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
      if (result.strong) {
        setType("normal", M.timeSize)
        semiboldText(doc, fit(result.text, RIGHT_WIDTH), right, baseline, "right")
      } else {
        setType("normal", M.smallSize, INK_SECONDARY)
        doc.text(fit(result.text, RIGHT_WIDTH), right, baseline, { align: "right" })
      }
    } else {
      setType("normal", M.timeSize, INK_TERTIARY)
      doc.text("—", timeRight, baseline, { align: "right" })
    }
  }

  function drawRow(row: RosterSummaryPdfRow, top: number) {
    if (row.subheading) {
      setType("bold", M.subheadingSize, ACCENT)
      const label = fit(row.label.toUpperCase(), right - left, M.subheadingCharSpace)
      doc.text(label, left, top + M.subheadingHeight - M.subheadingPadBottom, { charSpace: M.subheadingCharSpace })
      return
    }
    const textLeft = rowTextLeft(row)
    const maxText = textRight(row) - textLeft
    // Lines under the label run beneath the result block, out to the column edge.
    const maxBelow = right - textLeft
    const labelTop = top + M.rowPadY
    const topBaseline = centeredBaseline(labelTop, M.labelLh, M.labelSize)
    // With nothing under it but the start time (in the heat & lane column), the label line — label,
    // sub, result — centers on the row like the event badge.
    const centered =
      Boolean(row.startTime) &&
      metaLines(row).length === 0 &&
      legsLineCount(row) === 0 &&
      splitsLineCount(row) === 0 &&
      cutsLineCount(row) === 0
    // The result centers on the label line and the start time's line either way, like the badge.
    const twoLineBaseline = centeredBaseline(labelTop, M.labelLh + M.metaLh, M.labelSize)
    const baseline = centered ? twoLineBaseline : topBaseline
    const resultBaseline = row.startTime ? twoLineBaseline : baseline
    if (row.eventNumber) {
      // Centered on the label and the line under it when there is one; on the label otherwise.
      const twoLines = linesBelow(row) > 0
      const span = twoLines ? M.labelLh + M.metaLh : M.labelLh
      badge(row.eventNumber, left, labelTop + (span - M.badgeSize) / 2, M.badgeSize, M.badgeTextSize)
    } else if (row.place) {
      // On the label line, like an event's place on the result line.
      setType("bold", M.smallSize, PODIUM[row.place] ?? INK_SECONDARY)
      doc.text(formatOrdinal(row.place), left, besideLabel(baseline, M.smallSize))
    }
    const shownLabel = rowLabel(row)
    setType("normal", M.labelSize)
    const label = fit(shownLabel, maxText)
    doc.text(label, textLeft, baseline)
    let labelEndX = textLeft + doc.getTextWidth(label)
    if (row.round) labelEndX = drawRound(row.round, labelEndX + M.roundGap, baseline)
    if (row.sub) {
      setType("normal", M.subSize, INK_TERTIARY)
      const subLeft = labelEndX + px(6)
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
    drawSplits(row, textLeft, lineTop + legsLineCount(row) * M.metaLh, maxBelow)
    drawCuts(row, textLeft, lineTop + (legsLineCount(row) + splitsLineCount(row)) * M.metaLh)
  }

  function drawSectionHeader(section: RosterSummaryPdfSection, top: number, continued: boolean) {
    let x = left
    const badgeTop = top + (M.sectionHeaderHeight - M.badgeSize) / 2
    if (section.eventNumber) {
      x += badge(section.eventNumber, x, badgeTop, M.badgeSize, M.badgeTextSize) + M.badgeGap
    } else if (section.icon) {
      x += iconBadge(section.icon, x, badgeTop, M.badgeSize) + M.badgeGap
    }
    setType("normal", M.sectionTitleSize)
    const baseline = centeredBaseline(top, M.sectionHeaderHeight, M.sectionTitleSize)
    const suffix = continued ? " (cont.)" : ""
    const title = fit(`${section.title}${suffix}`, right - x, MEDIUM_CHAR_SPACE)
    let titleEnd = x + mediumTextWidth(title)
    if (suffix && title === pdfText(`${section.title}${suffix}`)) {
      const name = pdfText(section.title)
      mediumText(name, x, baseline)
      doc.setTextColor(...INK_SECONDARY)
      doc.text(suffix, x + mediumTextWidth(name), baseline)
      titleEnd = x + mediumTextWidth(name) + doc.getTextWidth(suffix)
    } else {
      mediumText(title, x, baseline)
    }
    // The round after the title in gold caps, like a row's after its label, when it fits whole.
    if (section.sub && titleEnd + M.roundGap + roundWidth(section.sub) <= right) {
      drawRound(section.sub, titleEnd + M.roundGap, baseline)
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
  let y = baseline + M.meetHeaderGap

  // ---- order of events: each session a bordered table, Women | Event | Men ----

  function drawOrderOfEvents(order: EventOrderWithHeats, top: number): number {
    const sessions = order.sessions.filter((session) => session.rows.length > 0)
    if (sessions.length === 0) return top
    const columns = M.orderMaxColumns
    const gap = M.columnGap
    const width = sessions.length === 1 ? columnWidth * M.orderSoloScale : columnWidth
    const labelled = (label: string) => label.trim().toLowerCase() !== "order of events"
    type Session = EventOrderWithHeats["sessions"][number]
    const boxHeight = (session: Session) =>
      (labelled(session.label) ? M.orderSessionHeight : 0) + M.orderHeadHeight + session.rows.length * M.orderRowHeight
    /** One session's box at (x, yy). */
    function drawBox(session: Session, x: number, yy: number) {
      const height = boxHeight(session)
      let rowTop = yy
      if (labelled(session.label)) {
        // A gold-tinted title strip with the box's rounded top corners, like the event badges.
        doc.setFillColor(...ACCENT_BG)
        doc.roundedRect(x, yy, width, M.orderSessionHeight + M.orderRadius, M.orderRadius, M.orderRadius, "F")
        doc.setFillColor(...WHITE)
        doc.rect(x, yy + M.orderSessionHeight, width, M.orderRadius, "F")
        // Gold capitals, centered over the table.
        const charSpace = px(0.8)
        setType("bold", M.orderSessionSize, ACCENT)
        const title = fit(session.label.toUpperCase(), width - M.orderPadX * 2, charSpace)
        const titleWidth = doc.getTextWidth(title) + title.length * charSpace
        doc.text(title, x + (width - titleWidth) / 2, centeredBaseline(yy, M.orderSessionHeight, M.orderSessionSize), {
          charSpace,
        })
        rowTop += M.orderSessionHeight
        doc.setDrawColor(...ACCENT_BORDER)
        doc.setLineWidth(0.75)
        doc.line(x, rowTop, x + width, rowTop)
      }
      // Column heads like the "SEED" tag.
      const headBaseline = centeredBaseline(rowTop, M.orderHeadHeight, M.seedTagSize)
      const headSpace = px(1)
      setType("bold", M.seedTagSize, INK_TERTIARY)
      const headWidth = (head: string) => doc.getTextWidth(head) + head.length * headSpace
      doc.text("WOMEN", x + M.orderPadX, headBaseline, { charSpace: headSpace })
      const eventHead = "EVENT"
      doc.text(eventHead, x + (width - headWidth(eventHead)) / 2, headBaseline, { charSpace: headSpace })
      const menHead = "MEN"
      doc.text(menHead, x + width - M.orderPadX - headWidth(menHead), headBaseline, { charSpace: headSpace })
      // Heat counts, when a heat sheet gives any: a HEATS column inside each event-number column,
      // the same distance in from both sides.
      const heatsHead = "HEATS"
      const hasHeats = session.rows.some((row) => row.womenHeats != null || row.menHeats != null)
      const heatsInset = M.orderPadX + Math.max(headWidth("WOMEN"), headWidth(menHead)) + M.orderHeatsGap
      const heatsWidth = headWidth(heatsHead)
      const womenHeatsCenter = x + heatsInset + heatsWidth / 2
      const menHeatsCenter = x + width - heatsInset - heatsWidth / 2
      if (hasHeats) {
        doc.text(heatsHead, womenHeatsCenter - heatsWidth / 2, headBaseline, { charSpace: headSpace })
        doc.text(heatsHead, menHeatsCenter - heatsWidth / 2, headBaseline, { charSpace: headSpace })
      }
      const eventInset = hasHeats ? heatsInset + heatsWidth + M.orderHeatsGap / 2 : M.orderPadX + M.orderNumberWidth
      rowTop += M.orderHeadHeight
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.75)
      doc.line(x, rowTop, x + width, rowTop)
      session.rows.forEach((row, r) => {
        if (r > 0) {
          doc.setDrawColor(...BORDER_SUBTLE)
          doc.setLineWidth(0.5)
          doc.line(x, rowTop, x + width, rowTop)
        }
        const rowBaseline = centeredBaseline(rowTop, M.orderRowHeight, M.labelSize)
        // Event numbers in the badges' gold, events like row labels.
        setType("bold", M.labelSize, ACCENT)
        if (row.women != null) doc.text(String(row.women), x + M.orderPadX, rowBaseline)
        if (row.men != null) doc.text(String(row.men), x + width - M.orderPadX, rowBaseline, { align: "right" })
        setType("normal", M.labelSize, INK_SECONDARY)
        if (row.womenHeats != null) doc.text(String(row.womenHeats), womenHeatsCenter, rowBaseline, { align: "center" })
        if (row.menHeats != null) doc.text(String(row.menHeats), menHeatsCenter, rowBaseline, { align: "center" })
        setType("normal", M.labelSize, INK)
        const event = fit(cleanEventName(row.event), width - eventInset * 2)
        doc.text(event, x + width / 2, rowBaseline, { align: "center" })
        rowTop += M.orderRowHeight
      })
      doc.setDrawColor(...ACCENT_BORDER)
      doc.setLineWidth(0.75)
      doc.roundedRect(x, yy, width, height, M.orderRadius, M.orderRadius, "S")
    }

    // Down the left column, then the right: split where the columns come out most even, in order.
    const stackHeight = (list: Session[]) =>
      list.reduce((sum, session, i) => sum + (i > 0 ? M.orderGap : 0) + boxHeight(session), 0)
    let split = sessions.length
    let best = Infinity
    for (let k = 1; k <= sessions.length && columns > 1; k++) {
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
    if (yy + height > contentBottom && yy > M.margin) {
      doc.addPage()
      yy = M.margin
    }
    // A lone session is centered on the page; several fill the columns from the left.
    const firstX = sessions.length === 1 ? pageLeft + (pageRight - pageLeft - width) / 2 : pageLeft
    stacks.forEach((stack, column) => {
      const x = firstX + column * (width + gap)
      let boxTop = yy
      for (const session of stack) {
        drawBox(session, x, boxTop)
        boxTop += boxHeight(session) + M.orderGap
      }
    })
    return yy + height + M.headerGap
  }

  if (input.eventOrder) y = drawOrderOfEvents(input.eventOrder, y)

  // ---- highlights: the carousel's counters as rows of tiles across the page ----

  /** Text centered on `cx`, with letter spacing counted in its width. */
  function centeredText(value: string, cx: number, baseline: number, charSpace = 0) {
    const width = doc.getTextWidth(value) + value.length * charSpace
    doc.text(value, cx - width / 2, baseline, charSpace ? { charSpace } : undefined)
  }

  /**
   * A tile's value as drawn: its size (shrunk to fit, down to a floor) and lines — a value still too
   * wide at the floor (tied names) wraps rather than being cut short.
   */
  function tileValue(counter: StatCounter, room: number): { size: number; lines: string[] } {
    const value = pdfText(String(counter.value))
    setType("bold", M.tileValueSize)
    const natural = doc.getTextWidth(value)
    if (natural <= room) return { size: M.tileValueSize, lines: [value] }
    const size = Math.max(M.tileValueMinSize, (M.tileValueSize * room) / natural)
    setType("bold", size)
    const greedy = doc.splitTextToSize(value, room) as string[]
    // As many lines as wrapping needs, but even: broken between names ("Ann Lee, Bo Kim," over
    // "Cy Diaz, & Di Fox") when that fits, else between words — never before a serial comma's "&".
    const names = value.split(/(?<=,)\s+(?!&\s)|(?<!,)\s+(?=&\s)/)
    const lines =
      evenLines(names, greedy.length, room) ?? evenLines(value.split(/\s+/), greedy.length, room) ?? greedy
    return { size, lines }
  }

  /**
   * `units` joined into `count` lines no wider than `room`, split where the widest line is
   * narrowest; null when they don't fit in that many lines. In the current font.
   */
  function evenLines(units: string[], count: number, room: number): string[] | null {
    const best = { lines: [] as string[], widest: Infinity }
    const split = (from: number, left: number, lines: string[], widest: number) => {
      if (widest >= best.widest) return
      if (left === 1) {
        const line = units.slice(from).join(" ")
        const width = doc.getTextWidth(line)
        if (width <= room && Math.max(widest, width) < best.widest) {
          best.lines = [...lines, line]
          best.widest = Math.max(widest, width)
        }
        return
      }
      // Leave at least a unit for each line still to come.
      for (let end = from + 1; end <= units.length - left + 1; end++) {
        const line = units.slice(from, end).join(" ")
        const width = doc.getTextWidth(line)
        if (width > room) break
        split(end, left - 1, [...lines, line], Math.max(widest, width))
      }
    }
    if (units.length >= count) split(0, count, [], 0)
    return best.lines.length > 0 ? best.lines : null
  }

  const tileRoom = (width: number) => width - M.tilePadX * 2
  /** The value's extra lines past the first, at the floor size's line height. */
  const tileValueHeight = (lines: number) => M.tileValueLh + (lines - 1) * M.tileValueMinLh
  const TILE_LABEL_SPACE = px(0.5)

  /** A tile's caps label in lines: on one when it fits, else wrapped between words. */
  function tileLabel(counter: StatCounter, room: number): string[] {
    setType("bold", M.seedTagSize)
    const width = (s: string) => doc.getTextWidth(s) + s.length * TILE_LABEL_SPACE
    const lines: string[] = []
    for (const word of pdfText(counter.label.toUpperCase()).split(" ")) {
      const last = lines[lines.length - 1]
      if (last != null && width(`${last} ${word}`) <= room) lines[lines.length - 1] = `${last} ${word}`
      else lines.push(word)
    }
    return lines.map((line) => fit(line, room, TILE_LABEL_SPACE))
  }

  /** The detail after the hint on their shared line: " (-43.5 to UGA)". */
  const inlineDetail = (detail: string) => ` (${detail})`

  /** The hint and detail share a line ("248 pts (-43.5 to UGA)") when both are there and it fits. */
  function tileDetailInline(counter: StatCounter, room: number): boolean {
    if (!counter.hint || !counter.detail) return false
    setType("normal", M.metaSize)
    return doc.getTextWidth(pdfText(`${counter.hint}${inlineDetail(counter.detail)}`)) <= room
  }

  /** Between the caps label and a hint set beside it: "BUSIEST · 12 races". */
  const LABEL_HINT_SEPARATOR = " · "

  /** A one-line label's width with the hint beside it, or null when the counter keeps its hint below. */
  function labelWithHintWidth(counter: StatCounter, room: number): { label: number; hint: number } | null {
    if (!counter.hintBesideLabel || !counter.hint) return null
    const labelLines = tileLabel(counter, room)
    if (labelLines.length !== 1) return null
    setType("bold", M.seedTagSize)
    const label = doc.getTextWidth(labelLines[0]) + labelLines[0].length * TILE_LABEL_SPACE
    setType("normal", M.metaSize)
    const hint = doc.getTextWidth(pdfText(`${LABEL_HINT_SEPARATOR}${counter.hint}`))
    return label + hint <= room ? { label, hint } : null
  }

  /** Lines under the label: the hint and detail, together or one each (the hint none when it's beside the label). */
  function tileDetailLines(counter: StatCounter, room: number): number {
    if (labelWithHintWidth(counter, room)) return counter.detail ? 1 : 0
    if (tileDetailInline(counter, room)) return 1
    return (counter.hint ? 1 : 0) + (counter.detail ? 1 : 0)
  }

  /** A tile's lines' height: its value, label, hint and detail. */
  function tileContentHeight(counter: StatCounter, width: number): number {
    const room = tileRoom(width)
    return (
      tileValueHeight(tileValue(counter, room).lines.length) +
      M.tileLabelLh +
      (tileLabel(counter, room).length - 1) * M.tileLabelWrapLh +
      tileDetailLines(counter, room) * M.metaLh
    )
  }

  /** One tile: the value (a drop in green), its caps label, then hint and detail (on one line when they fit). */
  function drawTile(counter: StatCounter, x: number, top: number, width: number, height: number) {
    doc.setFillColor(...WHITE)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.75)
    doc.roundedRect(x, top, width, height, M.tileRadius, M.tileRadius, "FD")
    const cx = x + width / 2
    const room = tileRoom(width)
    // The tile's lines sit centered in it, however tall its row made it.
    const { size, lines } = tileValue(counter, room)
    const contentHeight = tileContentHeight(counter, width)
    let lineTop = top + (height - contentHeight) / 2
    const podium = counter.place != null && counter.place <= 3 ? PODIUM[counter.place] : undefined
    setType("bold", size, podium ?? (isDropCounterValue(counter.value) ? FASTER : INK))
    if (lines.length === 1) {
      centeredText(lines[0], cx, centeredBaseline(lineTop, M.tileValueLh, size))
    } else {
      // Wrapped lines, centered as a block in the value's space.
      const blockTop = lineTop + (tileValueHeight(lines.length) - lines.length * M.tileValueMinLh) / 2
      lines.forEach((line, i) => {
        centeredText(line, cx, centeredBaseline(blockTop + i * M.tileValueMinLh, M.tileValueMinLh, size))
      })
    }
    lineTop += tileValueHeight(lines.length)
    const labelLines = tileLabel(counter, room)
    const beside = labelWithHintWidth(counter, room)
    if (beside) {
      // The caps label, then the hint in its own type, centered together on one line.
      const left = cx - (beside.label + beside.hint) / 2
      setType("bold", M.seedTagSize, ACCENT)
      doc.text(labelLines[0], left, centeredBaseline(lineTop, M.tileLabelLh, M.seedTagSize), { charSpace: TILE_LABEL_SPACE })
      setType("normal", M.metaSize, INK_SECONDARY)
      doc.text(pdfText(`${LABEL_HINT_SEPARATOR}${counter.hint}`), left + beside.label, centeredBaseline(lineTop, M.tileLabelLh, M.metaSize))
      lineTop += M.tileLabelLh
      if (counter.detail) {
        setType("normal", M.metaSize, INK_TERTIARY)
        centeredText(fit(counter.detail, room), cx, centeredBaseline(lineTop, M.metaLh, M.metaSize))
      }
      return
    }
    setType("bold", M.seedTagSize, ACCENT)
    labelLines.forEach((line, i) => {
      const lineHeight = i === 0 ? M.tileLabelLh : M.tileLabelWrapLh
      const labelTop = lineTop + (i === 0 ? 0 : M.tileLabelLh + (i - 1) * M.tileLabelWrapLh)
      centeredText(line, cx, centeredBaseline(labelTop, lineHeight, M.seedTagSize), TILE_LABEL_SPACE)
    })
    lineTop += M.tileLabelLh + (labelLines.length - 1) * M.tileLabelWrapLh
    if (counter.hint && counter.detail && tileDetailInline(counter, room)) {
      // One centered line: the hint, then the quieter detail.
      const hint = pdfText(counter.hint)
      const detail = pdfText(inlineDetail(counter.detail))
      setType("normal", M.metaSize)
      const left = cx - (doc.getTextWidth(hint) + doc.getTextWidth(detail)) / 2
      const baseline = centeredBaseline(lineTop, M.metaLh, M.metaSize)
      setType("normal", M.metaSize, INK_SECONDARY)
      doc.text(hint, left, baseline)
      const detailLeft = left + doc.getTextWidth(hint)
      setType("normal", M.metaSize, INK_TERTIARY)
      doc.text(detail, detailLeft, baseline)
      return
    }
    if (counter.hint) {
      setType("normal", M.metaSize, INK_SECONDARY)
      centeredText(fit(counter.hint, room), cx, centeredBaseline(lineTop, M.metaLh, M.metaSize))
      lineTop += M.metaLh
    }
    if (counter.detail) {
      setType("normal", M.metaSize, INK_TERTIARY)
      centeredText(fit(counter.detail, room), cx, centeredBaseline(lineTop, M.metaLh, M.metaSize))
    }
  }

  /**
   * The highlights in rows of tiles spanning the page — team scores, the plain counters (up to six
   * across), then the rest — returns the y below.
   */
  function drawHighlights(counters: StatCounter[], top: number): number {
    const rows = highlightTileRows(counters, 6)
    if (rows.length === 0) return top
    // The page's eyebrow already says "Highlights".
    let yy = top
    for (const { counters: row } of rows) {
      // Every row spans the page, a short one with wider tiles.
      const width = (pageRight - pageLeft - (row.length - 1) * M.tileGap) / row.length
      // As tall as the row's tallest tile.
      const height = M.tilePadY * 2 + Math.max(...row.map((c) => tileContentHeight(c, width)))
      row.forEach((counter, i) => drawTile(counter, pageLeft + i * (width + M.tileGap), yy, width, height))
      yy += height + M.tileGap
    }
    return yy - M.tileGap + M.headerGap
  }

  if (request.highlights) y = drawHighlights(request.highlights.counters, y)

  if (request.sections.length === 0 && !request.highlights) {
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
      if (i > 0) yy += sectionGap
      drawSectionHeader(piece.section, yy, piece.startRow > 0)
      yy += M.sectionHeaderHeight
      for (let r = piece.startRow; r < piece.endRow; r++) {
        // No rule against a subheading: the space above it parts the subsections.
        const rows = piece.section.rows
        if (r > piece.startRow && !rows[r].subheading && !rows[r - 1].subheading) {
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
      const gap = taken.length > 0 ? sectionGap : 0
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
      // A subheading goes on with its rows.
      while (end > piece.startRow && piece.section.rows[end - 1].subheading) end -= 1
      if (end === piece.startRow) return [taken, queue.slice(i)]
      taken.push({ ...piece, endRow: end })
      return [taken, [{ ...piece, startRow: end }, ...queue.slice(i + 1)]]
    }
    return [taken, []]
  }

  function stackHeight(pieces: Piece[]): number {
    return pieces.reduce((sum, piece, i) => sum + (i > 0 ? sectionGap : 0) + pieceHeight(piece), 0)
  }

  /**
   * A one-page export's sections split once between the columns where the taller one is shortest —
   * after a section, or between two of its rows (it continues atop the right column) — so the
   * columns end level and fill the page. Null when no split fits both in `avail`.
   */
  function balancedColumns(queue: Piece[], avail: number): [Piece[], Piece[]] | null {
    let best: { columns: [Piece[], Piece[]]; height: number } | null = null
    for (let i = 0; i < queue.length; i++) {
      const piece = queue[i]
      for (let end = piece.startRow + 1; end <= piece.endRow; end++) {
        if (piece.section.rows[end - 1].subheading) continue
        const first = [...queue.slice(0, i), { ...piece, endRow: end }]
        const rest = queue.slice(i + 1)
        const second = end < piece.endRow ? [{ ...piece, startRow: end }, ...rest] : rest
        const height = Math.max(stackHeight(first), stackHeight(second))
        if (height <= avail && (!best || height < best.height)) best = { columns: [first, second], height }
      }
    }
    return best?.columns ?? null
  }

  /** Lay out sections in two columns from `top`; returns the y below them. */
  function flowColumns(sections: RosterSummaryPdfSection[], top: number): number {
    setColumn(0)
    let queue: Piece[] = sections.map((section) => ({ section, startRow: 0, endRow: section.rows.length }))
    let yy = top
    const balanced = request.fitOnePage ? balancedColumns(queue, contentBottom - yy) : null
    if (balanced) {
      const firstBottom = drawStack(balanced[0], yy)
      setColumn(1)
      return Math.max(firstBottom, drawStack(balanced[1], yy))
    }
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

  // A round (with any result tags) that won't fit beside the label leads the line below instead,
  // rather than being cut off. Every column is as wide as the first, so measuring there holds for
  // all; rows change in place so the medley set and height cache still know them.
  setColumn(0)
  for (const section of request.sections) {
    for (const row of section.rows) {
      if (row.sub && labelEnd(row) > textRight(row, true)) {
        row.meta = [row.sub, row.meta].filter(Boolean).join(" | ")
        row.sub = undefined
      }
      if (row.round && labelEnd(row) > textRight(row, true)) {
        row.meta = [row.round, row.meta].filter(Boolean).join(" | ")
        row.round = undefined
      }
    }
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

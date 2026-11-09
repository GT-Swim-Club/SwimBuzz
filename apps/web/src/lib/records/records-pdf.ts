import { jsPDF } from "jspdf"
import {
  RECORDS_EXPORT,
  recordSwimmerName,
  recordTimeLabel,
  recordsExportFilename,
  type RecordGender,
  type TeamRecordItem,
  type TeamRecordRow,
} from "@swimbuzz/shared"

export type RecordsPdfInput = {
  rows: TeamRecordRow[]
  /** "Rev. Nov 9, 2026", in the mixed relay's empty men's cell at the table's bottom right. */
  asOf: string
}

type RGB = [number, number, number]

// Light-theme brand tokens (variables.css); the PDF is always printed on white.
const ACCENT: RGB = [140, 107, 56]
const INK: RGB = [31, 31, 31]
const INK_SECONDARY: RGB = [89, 89, 89]
const INK_TERTIARY: RGB = [140, 140, 140]
const BORDER: RGB = [234, 234, 234]
/** --brand-color-fill: the heavier rules between stroke groups. */
const FILL: RGB = [217, 217, 217]
/** The table's header band: --brand-color-fill-secondary at 60% on white, like the records page. */
const HEADER_BG: RGB = [246, 246, 246]

/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

// Table sizes at full scale; the whole table shrinks together to fit the page.
const TABLE = {
  bandHeight: px(42),
  bandSize: px(15),
  bandCharSpace: px(1.5),
  asOfSize: px(12),
  /** The date's distance from the empty cell's bottom and right edges. */
  asOfInset: px(8),
  labelHeight: px(24),
  labelSize: px(9),
  labelCharSpace: px(1.1),
  textSize: px(13),
  lineHeight: px(17),
  rowPadY: px(4),
  cellPadX: px(8),
  yearWidth: px(56),
  // Room for a lead-off time with its "(R)" ("1:08.94 (R)").
  timeWidth: px(90),
  radius: px(8),
}

const LETTER = { width: 612, height: 792 }
const MARGIN = px(40)

export function recordsPdfFilename(): string {
  return recordsExportFilename("pdf")
}

/**
 * The team records sheet on a single Letter page, laid out like the records page's wide table:
 * women's records (year, name, time) mirrored against men's around the event column, the mixed
 * relay's empty men's side filled in with the date at its bottom right, and this season's records in
 * bold gold. The table shrinks as a whole until it fits; portrait or landscape, whichever keeps it
 * bigger.
 */
export function buildRecordsPdf(input: RecordsPdfInput): jsPDF {
  const portrait = drawRecordsPdf(input, "portrait")
  if (portrait.scale >= 1) return portrait.doc
  const landscape = drawRecordsPdf(input, "landscape")
  return landscape.scale > portrait.scale ? landscape.doc : portrait.doc
}

function drawRecordsPdf(input: RecordsPdfInput, orientation: "portrait" | "landscape"): { doc: jsPDF; scale: number } {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation })
  const pageWidth = orientation === "portrait" ? LETTER.width : LETTER.height
  const pageHeight = orientation === "portrait" ? LETTER.height : LETTER.width
  const contentWidth = pageWidth - MARGIN * 2

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

  /** Width of caps text with letter spacing (jsPDF spaces after every glyph; only the gaps show). */
  function spacedWidth(text: string, charSpace: number): number {
    return doc.getTextWidth(text) + Math.max(0, text.length - 1) * charSpace
  }

  /** Baseline that vertically centers `size` text in a box starting at `top`. */
  function centeredBaseline(top: number, height: number, size: number): number {
    return top + height / 2 + size * 0.35
  }

  doc.setProperties({ title: `${RECORDS_EXPORT.title} - ${RECORDS_EXPORT.eyebrow}`, author: "SwimBuzz", creator: "SwimBuzz" })

  const tableTop = MARGIN

  const rows = input.rows
  const lineCount = (row: TeamRecordRow) => (row.relay ? 4 : 1)

  // Measure at full size: the widest name and event label set their columns.
  const bandLabels = {
    women: "WOMEN'S RECORDS",
    center: RECORDS_EXPORT.eyebrow.toUpperCase(),
    men: "MEN'S RECORDS",
  }
  function naturalWidths(m: typeof TABLE) {
    setType("bold", m.textSize)
    let name = 0
    for (const row of rows) {
      for (const record of Object.values(row.records)) {
        if (!record) continue
        for (const swimmer of record.swimmers) name = Math.max(name, doc.getTextWidth(recordSwimmerName(swimmer)))
      }
    }
    setType("normal", m.textSize)
    let event = Math.max(0, ...rows.map((row) => doc.getTextWidth(row.label)))
    setType("bold", m.bandSize)
    event = Math.max(event, spacedWidth(bandLabels.center, m.bandCharSpace))
    return { name: name + m.cellPadX * 2, event: event + m.cellPadX * 2 }
  }
  function tableHeight(m: typeof TABLE): number {
    return (
      m.bandHeight +
      m.labelHeight +
      rows.reduce((sum, row) => sum + lineCount(row) * m.lineHeight + m.rowPadY * 2, 0)
    )
  }
  const natural = naturalWidths(TABLE)
  const naturalWidth = 2 * (TABLE.yearWidth + natural.name + TABLE.timeWidth) + natural.event
  const scale = Math.min(1, contentWidth / naturalWidth, (pageHeight - MARGIN - tableTop) / tableHeight(TABLE))
  const m = Object.fromEntries(Object.entries(TABLE).map(([key, value]) => [key, value * scale])) as typeof TABLE

  // The two name columns share whatever width is left, so the table spans the page.
  const eventWidth = natural.event * scale
  const nameWidth = (contentWidth - eventWidth - 2 * (m.yearWidth + m.timeWidth)) / 2
  const sideWidth = m.yearWidth + nameWidth + m.timeWidth
  const left = MARGIN
  const eventX = left + sideWidth
  const menX = eventX + eventWidth
  const right = left + contentWidth
  const height = tableHeight(m)

  type Column = { key: "year" | "name" | "time"; x: number; width: number }
  // Women's read year, name, time from the outside edge in; men's mirror them from the center out.
  const womenColumns: Column[] = [
    { key: "year", x: left, width: m.yearWidth },
    { key: "name", x: left + m.yearWidth, width: nameWidth },
    { key: "time", x: left + m.yearWidth + nameWidth, width: m.timeWidth },
  ]
  const menColumns: Column[] = [
    { key: "time", x: menX, width: m.timeWidth },
    { key: "name", x: menX + m.timeWidth, width: nameWidth },
    { key: "year", x: menX + m.timeWidth + nameWidth, width: m.yearWidth },
  ]

  // Header band: rounded on top, square where it meets the column labels.
  doc.setFillColor(...HEADER_BG)
  doc.roundedRect(left, tableTop, contentWidth, m.bandHeight, m.radius, m.radius, "F")
  doc.rect(left, tableTop + m.bandHeight - m.radius, contentWidth, m.radius, "F")
  setType("bold", m.bandSize, ACCENT)
  const bandBaseline = centeredBaseline(tableTop, m.bandHeight, m.bandSize)
  const bandText = (label: string, x: number, width: number) =>
    doc.text(label, x + (width - spacedWidth(label, m.bandCharSpace)) / 2, bandBaseline, { charSpace: m.bandCharSpace })
  bandText(bandLabels.women, left, sideWidth)
  bandText(bandLabels.center, eventX, eventWidth)
  bandText(bandLabels.men, menX, sideWidth)

  // Column labels.
  const labelTop = tableTop + m.bandHeight
  const labelBaseline = centeredBaseline(labelTop, m.labelHeight, m.labelSize)
  setType("bold", m.labelSize, INK_TERTIARY)
  const labelText = (label: string, x: number, width: number) =>
    doc.text(label, x + (width - spacedWidth(label, m.labelCharSpace)) / 2, labelBaseline, { charSpace: m.labelCharSpace })
  for (const column of [...womenColumns, ...menColumns]) labelText(column.key.toUpperCase(), column.x, column.width)
  labelText("EVENT", eventX, eventWidth)

  doc.setLineWidth(0.75)
  doc.setDrawColor(...BORDER)
  doc.line(left, labelTop, right, labelTop)
  doc.setDrawColor(...FILL)
  doc.line(left, labelTop + m.labelHeight, right, labelTop + m.labelHeight)

  function drawSide(record: TeamRecordItem | undefined, columns: Column[], top: number, rowHeight: number) {
    const season = record?.isThisSeason ?? false
    const style = season ? "bold" : "normal"
    const color = season ? ACCENT : INK
    const baseline = centeredBaseline(top, rowHeight, m.textSize)
    for (const column of columns) {
      const center = column.x + column.width / 2
      const room = column.width - m.cellPadX * 2
      if (!record) {
        setType("normal", m.textSize, INK_TERTIARY)
        doc.text("—", center, baseline, { align: "center" })
        continue
      }
      setType(style, m.textSize, color)
      if (column.key === "year") doc.text(String(record.year), center, baseline, { align: "center" })
      else if (column.key === "time") doc.text(fit(recordTimeLabel(record), room), center, baseline, { align: "center" })
      else {
        const names = record.swimmers.map((swimmer) => recordSwimmerName(swimmer))
        const blockTop = top + (rowHeight - names.length * m.lineHeight) / 2
        names.forEach((name, i) => {
          const line = centeredBaseline(blockTop + i * m.lineHeight, m.lineHeight, m.textSize)
          doc.text(fit(name, room), center, line, { align: "center" })
        })
      }
    }
  }

  let y = labelTop + m.labelHeight
  rows.forEach((row, index) => {
    const rowHeight = lineCount(row) * m.lineHeight + m.rowPadY * 2
    if (index > 0) {
      const groupStart = rows[index - 1]!.group !== row.group
      doc.setLineWidth(0.75)
      doc.setDrawColor(...(groupStart || row.relay ? FILL : BORDER))
      doc.line(left, y, right, y)
    }
    const mixed = row.genders.length === 1 && row.genders[0] === "X"
    const record = (gender: RecordGender) => row.records[gender]
    drawSide(record(mixed ? "X" : "F"), womenColumns, y, rowHeight)
    if (mixed) {
      // The empty cell holds the date, at its bottom right.
      setType("normal", m.asOfSize, INK_SECONDARY)
      doc.text(input.asOf, menX + sideWidth - m.asOfInset, y + rowHeight - m.asOfInset, { align: "right" })
    } else {
      drawSide(record("M"), menColumns, y, rowHeight)
    }
    setType("normal", m.textSize)
    doc.text(fit(row.label, eventWidth - m.cellPadX * 2), eventX + eventWidth / 2, centeredBaseline(y, rowHeight, m.textSize), {
      align: "center",
    })
    y += rowHeight
  })

  // The event column's rules and the table's outline, over the fills.
  doc.setLineWidth(0.75)
  doc.setDrawColor(...BORDER)
  doc.line(eventX, tableTop, eventX, tableTop + height)
  doc.line(menX, tableTop, menX, tableTop + height)
  doc.roundedRect(left, tableTop, contentWidth, height, m.radius, m.radius, "S")

  return { doc, scale }
}

import { jsPDF } from "jspdf"
import { formatClockTimeRange } from "@swimbuzz/shared"
import { formatSwimDate } from "@/lib/utils"
import { isHtmlEmpty, normalizePracticeHtml } from "@/components/FormattedText"

export type PracticePdfSet = {
  title: string | null
  content: string
  distance: number | null
}

export type PracticePdfInput = {
  title: string
  published: boolean
  showDraft: boolean
  dateIso: string | null
  startTime: string
  endTime: string
  location: string
  focus: string | null
  tags: string[]
  sets: PracticePdfSet[]
  totalDistance: number
}

type Style = { bold: boolean; italic: boolean; underline: boolean }

type Run = { text: string; style: Style }

type Block =
  | { type: "paragraph"; runs: Run[] }
  | { type: "list-item"; ordered: boolean; index: number; depth: number; runs: Run[] }
  | { type: "rule" }

type RGB = [number, number, number]

const PRIMARY: RGB = [222, 189, 136]
const PRIMARY_ACTIVE: RGB = [140, 107, 56]
const PRIMARY_TEXT: RGB = [64, 43, 19]
const INK: RGB = [31, 31, 31]
const MUTED: RGB = [89, 89, 89]
const BORDER: RGB = [234, 234, 234]
const DRAFT_BG: RGB = [248, 242, 231]

/** CSS px → PDF pt at 96dpi. */
const px = (n: number) => n * 0.75

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
])

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
}

function plainStyle(): Style {
  return { bold: false, italic: false, underline: false }
}

function applyTagStyle(style: Style, tag: string, on: boolean): Style {
  const next = { ...style }
  if (tag === "strong" || tag === "b") next.bold = on ? true : style.bold
  if (tag === "em" || tag === "i") next.italic = on ? true : style.italic
  if (tag === "u") next.underline = on ? true : style.underline
  if (tag === "h1" || tag === "h2" || tag === "h3") next.bold = on ? true : style.bold
  return next
}

function tagName(token: string): string {
  return token.replace(/^<\/?([a-zA-Z][a-zA-Z0-9]*)[\s\S]*$/, "$1").toLowerCase()
}

function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = []
  let runs: Run[] = []
  const styleStack: Style[] = [plainStyle()]
  const listStack: { ordered: boolean; index: number }[] = []

  function currentStyle(): Style {
    return styleStack[styleStack.length - 1] ?? plainStyle()
  }

  function pushRun(text: string) {
    if (!text) return
    const style = currentStyle()
    const last = runs[runs.length - 1]
    if (
      last &&
      last.style.bold === style.bold &&
      last.style.italic === style.italic &&
      last.style.underline === style.underline
    ) {
      last.text += text
      return
    }
    runs.push({ text, style: { ...style } })
  }

  function flushLine() {
    blocks.push({ type: "paragraph", runs })
    runs = []
  }

  function flushListItem(ordered: boolean, index: number, depth: number) {
    blocks.push({ type: "list-item", ordered, index, depth, runs })
    runs = []
  }

  const tokens = normalizePracticeHtml(html).match(/<\/?[a-zA-Z][^>]*>|[^<]+/g) ?? []
  for (const raw of tokens) {
    if (raw.startsWith("<")) {
      const name = tagName(raw)
      const closing = raw.startsWith("</")
      if (name === "script" || name === "style") continue
      if (name === "br") {
        flushLine()
        continue
      }
      if (name === "hr") {
        flushLine()
        blocks.push({ type: "rule" })
        continue
      }
      if (name === "ul" || name === "ol") {
        if (closing) {
          if (runs.length > 0) flushLine()
          listStack.pop()
        } else {
          if (runs.length > 0) flushLine()
          listStack.push({ ordered: name === "ol", index: 0 })
        }
        continue
      }
      if (name === "li") {
        const list = listStack[listStack.length - 1]
        if (closing) {
          if (list) flushListItem(list.ordered, list.index, listStack.length - 1)
          else flushLine()
        } else if (list) {
          if (runs.length > 0) flushLine()
          list.index += 1
        }
        continue
      }
      if (BLOCK_TAGS.has(name)) {
        if (runs.length > 0) flushLine()
        if (!closing) styleStack.push(applyTagStyle(currentStyle(), name, true))
        else if (styleStack.length > 1) styleStack.pop()
        continue
      }
      if (closing) {
        if (styleStack.length > 1) styleStack.pop()
        continue
      }
      styleStack.push(applyTagStyle(currentStyle(), name, true))
      continue
    }

    const text = decodeEntities(raw).replace(/\r\n/g, "\n").replace(/\t/g, "    ")
    const parts = text.split("\n")
    parts.forEach((part, index) => {
      pushRun(part)
      if (index < parts.length - 1) {
        if (listStack.length > 0) {
          const list = listStack[listStack.length - 1]
          flushListItem(list.ordered, list.index, listStack.length - 1)
        } else {
          flushLine()
        }
      }
    })
  }
  if (runs.length > 0) flushLine()

  while (blocks.length > 0) {
    const last = blocks[blocks.length - 1]
    if (last.type === "paragraph" && last.runs.every((run) => run.text === "")) blocks.pop()
    else break
  }
  while (blocks.length > 0) {
    const first = blocks[0]
    if (first.type === "paragraph" && first.runs.every((run) => run.text === "")) blocks.shift()
    else break
  }
  return blocks
}

function fontFace(style: Style): "normal" | "bold" | "italic" | "bolditalic" {
  if (style.bold && style.italic) return "bolditalic"
  if (style.bold) return "bold"
  if (style.italic) return "italic"
  return "normal"
}

export function practicePdfFilename(title: string, dateIso: string | null): string {
  const datePart = dateIso ? dateIso.slice(0, 10) : "practice"
  const titlePart = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${datePart}${titlePart ? `-${titlePart}` : ""}.pdf`
}

export function buildPracticePdf(input: PracticePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = px(64)
  const contentWidth = pageWidth - margin * 2
  const footerTop = pageHeight - px(56)

  const spaceY5 = px(20)
  const spaceY2 = px(8)
  const py2 = px(8)
  const mt1 = px(4)
  const mt05 = px(2)
  const mt3 = px(12)
  const gap2 = px(8)
  const gap15 = px(6)
  const calloutPx = px(20)
  const calloutPy = px(16)
  const cardPx = px(24)
  const cardPyTop = px(36)
  const cardPyBottom = px(4)
  const cardRadius = px(16)
  const calloutRadius = px(16)
  const titleSize = px(36)
  const titleLh = px(45)
  const metaSize = px(18)
  const metaLh = px(28)
  const bodySize = px(14)
  const bodyLh = px(20)
  const setTitleSize = px(16)
  const setTitleLh = px(24)
  const distSize = px(12)
  const tagSize = px(12)
  const tagRow = px(20)
  const iconSize = px(14)

  let y = margin + titleSize * 0.85
  let inSetsCard = false
  let cardSegTop = 0

  function drawCardBorder(top: number, bottom: number) {
    const height = bottom - top
    if (height < 8) return
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.75)
    doc.roundedRect(margin, top, contentWidth, height, cardRadius, cardRadius, "S")
  }

  function drawFocusBox(top: number, height: number) {
    const radius = calloutRadius
    const bar = px(3)
    doc.setFillColor(...PRIMARY)
    doc.roundedRect(margin, top, contentWidth, height, radius, radius, "F")
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(margin + bar, top, contentWidth - bar, height, radius, radius, "F")
  }

  function newPage() {
    if (inSetsCard) {
      y += cardPyBottom
      drawCardBorder(cardSegTop, y)
    }
    doc.addPage()
    y = margin + titleSize * 0.85
    if (inSetsCard) {
      cardSegTop = y
      y += cardPyTop
    }
  }

  function ensureSpace(needed: number) {
    if (y + needed > footerTop - 8) newPage()
  }

  function setType(style: Style, size: number, color: RGB = INK) {
    doc.setFont("helvetica", fontFace(style))
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }

  function wrapToken(text: string, style: Style, size: number, maxWidth: number): string[] {
    setType(style, size)
    if (doc.getTextWidth(text) <= maxWidth) return [text]
    const parts: string[] = []
    let current = ""
    for (const char of text) {
      const next = current + char
      if (current && doc.getTextWidth(next) > maxWidth) {
        parts.push(current)
        current = char
      } else {
        current = next
      }
    }
    if (current) parts.push(current)
    return parts
  }

  function tokenizeRuns(runs: Run[]): Run[] {
    const tokens: Run[] = []
    for (const run of runs) {
      for (const piece of run.text.split(/([ \t]+)/)) {
        if (piece) tokens.push({ text: piece, style: run.style })
      }
    }
    return tokens
  }

  function measureRuns(runs: Run[], width: number, size: number, lineHeight: number): number {
    if (runs.length === 0 || runs.every((run) => run.text === "")) return lineHeight
    let cx = 0
    let lines = 1
    for (const token of tokenizeRuns(runs)) {
      for (const chunk of wrapToken(token.text, token.style, size, width)) {
        const isSpace = /^[ \t]+$/.test(chunk)
        const w = doc.getTextWidth(chunk)
        if (cx > 0 && cx + w > width && !isSpace) {
          lines += 1
          cx = 0
        }
        cx += w
      }
    }
    return lines * lineHeight
  }

  function measureBlocks(html: string, size: number, width: number, lineHeight: number): number {
    let height = 0
    for (const block of htmlToBlocks(html)) {
      if (block.type === "rule") {
        height += px(12)
        continue
      }
      const indent = block.type === "list-item" ? px(14) + block.depth * px(14) : 0
      height += measureRuns(block.runs, Math.max(40, width - indent), size, lineHeight)
    }
    return height
  }

  function drawRuns(
    runs: Run[],
    x: number,
    width: number,
    size: number,
    color: RGB,
    lineHeight: number
  ) {
    let cx = x
    for (const token of tokenizeRuns(runs)) {
      const chunks = wrapToken(token.text, token.style, size, width)
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const isSpace = /^[ \t]+$/.test(chunk)
        setType(token.style, size, color)
        const w = doc.getTextWidth(isSpace ? chunk.replace(/\t/g, "    ") : chunk)
        if (cx > x && cx + w > x + width && !isSpace) {
          y += lineHeight
          ensureSpace(lineHeight)
          cx = x
        }
        if (chunkIndex > 0 && cx !== x) {
          y += lineHeight
          ensureSpace(lineHeight)
          cx = x
        }
        if (!isSpace) {
          doc.text(chunk, cx, y)
          if (token.style.underline) {
            doc.setDrawColor(...color)
            doc.setLineWidth(0.6)
            doc.line(cx, y + 1.4, cx + w, y + 1.4)
          }
        }
        cx += w
      }
    }
    y += lineHeight
  }

  function drawBlocks(
    html: string,
    size: number,
    color: RGB,
    x: number,
    width: number,
    lineHeight: number
  ) {
    for (const block of htmlToBlocks(html)) {
      if (block.type === "rule") {
        ensureSpace(px(12))
        doc.setDrawColor(...BORDER)
        doc.setLineWidth(0.6)
        doc.line(x, y, x + width, y)
        y += px(12)
        continue
      }
      if (block.type === "paragraph") {
        ensureSpace(lineHeight)
        drawRuns(block.runs, x, width, size, color, lineHeight)
        continue
      }
      const indent = px(14) + block.depth * px(14)
      const marker = block.ordered ? `${block.index}. ` : "•  "
      ensureSpace(lineHeight)
      setType(plainStyle(), size, color)
      doc.text(marker, x + indent - px(14), y)
      drawRuns(block.runs, x + indent, width - indent, size, color, lineHeight)
    }
  }

  function drawCalendarIcon(x: number, baseline: number, color: RGB) {
    const s = iconSize
    const top = baseline - s + px(2)
    doc.setDrawColor(...color)
    doc.setLineWidth(0.85)
    doc.roundedRect(x, top + px(2), s, s - px(2), 1.2, 1.2, "S")
    doc.line(x, top + px(5.5), x + s, top + px(5.5))
    doc.line(x + px(3), top, x + px(3), top + px(3.5))
    doc.line(x + s - px(3), top, x + s - px(3), top + px(3.5))
  }

  function drawLocationIcon(x: number, baseline: number, color: RGB) {
    const s = iconSize
    const cx = x + s / 2
    const cy = baseline - s / 2 + px(1)
    doc.setDrawColor(...color)
    doc.setLineWidth(0.85)
    doc.circle(cx, cy - px(1.5), s * 0.22, "S")
    doc.line(cx - s * 0.35, cy, cx, cy + s * 0.48)
    doc.line(cx + s * 0.35, cy, cx, cy + s * 0.48)
  }

  function drawDraftBadge(x: number, baseline: number) {
    const label = "DRAFT"
    setType({ bold: true, italic: false, underline: false }, px(10), PRIMARY_ACTIVE)
    const w = doc.getTextWidth(label) + px(16)
    const h = px(18)
    doc.setFillColor(...DRAFT_BG)
    doc.roundedRect(x, baseline - px(12), w, h, h / 2, h / 2, "F")
    doc.text(label, x + px(8), baseline)
  }

  function measureTags(tags: string[], maxWidth: number): number {
    if (tags.length === 0) return 0
    let tx = 0
    let rows = 1
    for (const tag of tags) {
      setType(plainStyle(), tagSize, PRIMARY_TEXT)
      const w = doc.getTextWidth(tag) + px(16)
      if (tx > 0 && tx + w > maxWidth) {
        rows += 1
        tx = 0
      }
      tx += w + gap2
    }
    return (rows - 1) * tagRow + px(16)
  }

  function drawTags(tags: string[], x: number, maxWidth: number) {
    let tx = x
    for (const tag of tags) {
      setType(plainStyle(), tagSize, PRIMARY_TEXT)
      const w = doc.getTextWidth(tag) + px(16)
      if (tx > x && tx + w > x + maxWidth) {
        y += tagRow
        tx = x
      }
      doc.setFillColor(...PRIMARY)
      doc.roundedRect(tx, y - px(11), w, px(16), px(8), px(8), "F")
      doc.text(tag, tx + px(8), y + px(1))
      tx += w + gap2
    }
    y += px(12)
  }

  function drawMetaLine(icon: "calendar" | "location", text: string) {
    ensureSpace(metaLh)
    if (icon === "calendar") drawCalendarIcon(margin, y, MUTED)
    else drawLocationIcon(margin, y, MUTED)
    setType(plainStyle(), metaSize, MUTED)
    const lines = doc.splitTextToSize(text, contentWidth - iconSize - gap15) as string[]
    for (const [index, line] of lines.entries()) {
      if (index > 0) {
        y += metaLh
        ensureSpace(metaLh)
      }
      doc.text(line, margin + iconSize + gap15, y)
    }
  }

  doc.setProperties({
    title: input.title,
    author: "SwimBuzz",
    creator: "SwimBuzz",
  })

  const showDraft = input.showDraft && !input.published
  setType({ bold: true, italic: false, underline: false }, titleSize, INK)
  const titleLines = doc.splitTextToSize(
    input.title,
    contentWidth - (showDraft ? px(72) : 0)
  ) as string[]
  for (const [index, line] of titleLines.entries()) {
    ensureSpace(titleLh)
    setType({ bold: true, italic: false, underline: false }, titleSize, INK)
    doc.text(line, margin, y)
    if (index === 0 && showDraft) {
      const lineWidth = doc.getTextWidth(line)
      const badgeX = margin + lineWidth + gap2
      if (badgeX + px(64) <= margin + contentWidth) drawDraftBadge(badgeX, y - px(2))
      else drawDraftBadge(pageWidth - margin - px(64), y - px(2))
    }
    if (index < titleLines.length - 1) y += titleLh
  }

  y += titleSize * 0.22 + mt1 + metaSize * 0.8
  const dateLine = [
    input.dateIso ? formatSwimDate(input.dateIso) : "No date",
    input.startTime || input.endTime
      ? formatClockTimeRange(input.startTime, input.endTime)
      : null,
  ]
    .filter(Boolean)
    .join("  ·  ")
  drawMetaLine("calendar", dateLine)

  const placeBits = [
    input.location?.trim() || null,
    input.totalDistance > 0 ? `${input.totalDistance.toLocaleString()} yards` : null,
  ].filter((bit): bit is string => Boolean(bit))
  if (placeBits.length > 0) {
    y += metaSize * 1.05 + mt05
    if (input.location?.trim()) drawMetaLine("location", placeBits.join("  ·  "))
    else {
      ensureSpace(metaLh)
      setType(plainStyle(), metaSize, MUTED)
      doc.text(placeBits[0], margin, y)
    }
  }

  y += metaSize * 0.25 + spaceY5

  const hasFocus = Boolean(input.focus && !isHtmlEmpty(input.focus))
  const hasTags = input.tags.length > 0
  if (hasFocus || hasTags) {
    const innerWidth = contentWidth - calloutPx * 2
    const focusHeight = hasFocus ? measureBlocks(input.focus!, bodySize, innerWidth, bodyLh) : 0
    const tagsHeight = hasTags ? measureTags(input.tags, innerWidth) : 0
    const boxHeight =
      calloutPy * 2 + focusHeight + tagsHeight + (hasFocus && hasTags ? mt3 : 0)
    ensureSpace(boxHeight + spaceY5)
    const boxTop = y
    drawFocusBox(boxTop, boxHeight)
    y = boxTop + calloutPy + bodySize * 0.8
    if (hasFocus) {
      drawBlocks(input.focus!, bodySize, INK, margin + calloutPx, innerWidth, bodyLh)
    }
    if (hasTags) {
      if (hasFocus) y += mt3 - (bodyLh - bodySize)
      drawTags(input.tags, margin + calloutPx, innerWidth)
    }
    y = boxTop + boxHeight + spaceY5
  }

  const innerX = margin + cardPx
  const innerWidth = contentWidth - cardPx * 2

  function openSetsCard() {
    inSetsCard = true
    cardSegTop = y
    y += cardPyTop
  }

  function closeSetsCard() {
    y += cardPyBottom
    drawCardBorder(cardSegTop, y)
    inSetsCard = false
  }

  openSetsCard()

  if (input.sets.length === 0) {
    setType(plainStyle(), bodySize, MUTED)
    doc.text("No sets", innerX, y)
    y += bodyLh
  }

  input.sets.forEach((set, index) => {
    if (index > 0) y += py2 + spaceY2 + py2
    ensureSpace(setTitleLh + bodyLh)
    const setTitle = set.title?.trim() || "Set"
    setType({ bold: true, italic: false, underline: false }, setTitleSize, PRIMARY_ACTIVE)
    const titleWidth = innerWidth - (set.distance != null ? px(56) : 0)
    const setTitleLines = doc.splitTextToSize(setTitle, titleWidth) as string[]
    const titleTop = y
    for (const line of setTitleLines) {
      doc.text(line, innerX, y)
      y += setTitleLh
    }
    if (set.distance != null) {
      const dist = set.distance.toLocaleString()
      setType(plainStyle(), distSize, PRIMARY_ACTIVE)
      const distWidth = doc.getTextWidth(dist)
      doc.text(dist, margin + contentWidth - cardPx - distWidth, titleTop)
    }

    if (set.content && !isHtmlEmpty(set.content)) {
      y += mt1 - (setTitleLh - setTitleSize)
      drawBlocks(set.content, bodySize, INK, innerX, innerWidth, bodyLh)
    }
  })

  closeSetsCard()

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    setType(plainStyle(), px(11), MUTED)
    doc.text("SwimBuzz", margin, footerTop + px(8))
    const pageLabel = `${i} / ${pageCount}`
    doc.text(pageLabel, pageWidth - margin - doc.getTextWidth(pageLabel), footerTop + px(8))
  }

  return doc
}

export function downloadPracticePdf(input: PracticePdfInput) {
  buildPracticePdf(input).save(practicePdfFilename(input.title, input.dateIso))
}

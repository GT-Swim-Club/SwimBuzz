import { normalizePreferredName, parseFirstNameWithPreferredName, parseRosterName } from "@/lib/athlete/athlete-match"
import { normalizeGatechEmail } from "@/lib/auth/gatech-email"
import { MAX_SWIMCLOUD_IDS, parseSwimCloudProfileList } from "@/lib/swim/swimcloud-id"

export type ParsedRosterCsvRow = {
  rowNumber: number
  firstName: string
  lastName: string
  gtid?: string
  dob?: Date
  year?: string
  email?: string
  gender: "M" | "F"
  preferredName: string | null
  /**
   * From up to MAX_SWIMCLOUD_IDS SwimCloud columns, left to right, each cell holding
   * one or more IDs/links (SwimCloud sometimes splits a swimmer across profiles).
   */
  swimCloudIds?: number[]
}

export type RosterCsvParseResult = {
  rows: ParsedRosterCsvRow[]
  errors: Array<{ row: number; message: string }>
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ")
}

/** Map a header cell to a roster field when the label contains a known keyword. */
function resolveHeaderField(header: string): string | undefined {
  const h = normalizeHeader(header)
  const compact = h.replace(/\s/g, "")

  if (h.includes("gtid") || h.includes("student id")) return "gtid"
  if (h.includes("dob") || h.includes("date of birth") || h.includes("birthday")) return "dob"
  if (h.includes("academic year") || h.includes("class year") || (h.includes("year") && !h.includes("season"))) return "year"
  if (
    h.includes("preferred name") ||
    h.includes("preferred first") ||
    h === "preferred" ||
    h.includes("nickname") ||
    h.includes("alternate name")
  ) {
    return "preferredName"
  }
  if (h.includes("first name") || compact === "firstname" || h === "first") {
    return "firstName"
  }
  if (h.includes("last name") || compact === "lastname" || h === "last") {
    return "lastName"
  }
  // Skip boolean / list columns that mention email but are not address fields
  if (
    h.includes("email list") ||
    h.includes("in email list") ||
    h.includes("parent email") ||
    h.includes("family members")
  ) {
    return undefined
  }
  if (h.includes("e-mail") || h.includes("email")) return "email"
  if (h.includes("gender") || h === "sex") return "gender"
  if (swimCloudHeaderScore(header) != null) return "swimCloudId"
  if (nameHeaderScore(header) != null) return "name"

  return undefined
}

/**
 * Columns that mention "name" but are not the athlete. Signature/waiver
 * columns ("by signing your full name and the current date") and emergency
 * contacts are the usual false positives on a Google Form export.
 */
function isSkippedNameHeader(h: string): boolean {
  return (
    h.includes("emergency") ||
    h.includes("signature") ||
    h.includes("signing") ||
    h.includes("waiver") ||
    h.includes("parent") ||
    h.includes("family member") ||
    h.includes("contact name") ||
    h.includes("mentor")
  )
}

/** Higher scores win when several headers look like a full name. */
function nameHeaderScore(header: string): number | null {
  const h = normalizeHeader(header)
  if (isSkippedNameHeader(h)) return null

  // "Full Legal Name (First Last)" — "first" and "last" here are a format hint,
  // not separate columns, and this label should beat a generic "Name" column.
  if (h.includes("legal") && h.includes("name")) return 5
  if (h.includes("full name") || h.replace(/\s/g, "") === "fullname") return 4

  const looksLikeName =
    h === "name" ||
    h.endsWith(" name") ||
    h.startsWith("name ") ||
    h.includes(" name ")
  if (!looksLikeName) return null

  const mentionsFirst = /\bfirst\b/.test(h)
  const mentionsLast = /\blast\b/.test(h)
  if ((mentionsFirst || mentionsLast) && !(mentionsFirst && mentionsLast)) return null
  if (h.includes("nick") || h.includes("user") || h.includes("team") || h.includes("preferred")) {
    return null
  }

  return mentionsFirst && mentionsLast ? 4 : 2
}

/** Drop a trailing signature date ("Will Bolte 08/24/2026", "Name, 8/25/26"). */
function stripTrailingSignedDate(value: string): string {
  return value
    .replace(/[, ]+\(?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\)?\s*$/, "")
    .replace(/[, ]+$/, "")
    .trim()
}

/**
 * Optional SwimCloud profile column. Prefer an explicit profile/URL/ID header
 * over a bare "SwimCloud" label, and ignore yes/no questions that merely
 * mention the site.
 */
function swimCloudHeaderScore(header: string): number | null {
  const h = normalizeHeader(header)
  const compact = h.replace(/\s/g, "")
  const mentionsSwimCloud = compact.includes("swimcloud") || h.includes("swim cloud")
  const mentionsSwimmer = /\bswimmers?\b/.test(h)
  const isLink =
    h.includes("url") ||
    h.includes("link") ||
    h.includes("profile") ||
    /\bid\b/.test(h) ||
    compact.endsWith("id")

  if (h.includes("?") && !isLink) return null
  if (/\bname\b/.test(h) && !mentionsSwimCloud) return null

  if (mentionsSwimCloud && isLink) return 5
  if (mentionsSwimmer && isLink) return 4
  if (mentionsSwimCloud && h.split(/\s+/).filter(Boolean).length <= 4) return 3
  return null
}

/** Prefer GT / "email address" columns when several headers match "email". */
function emailHeaderScore(header: string): number {
  const h = normalizeHeader(header)
  if (h.includes("georgia tech") || h.includes("gatech")) return 3
  if (h.includes("email address") || h.includes("e-mail address")) return 2
  if (h.includes("email") || h.includes("e-mail")) return 1
  return 0
}

function mapHeaders(cells: string[]): Map<string, number> {
  const map = new Map<string, number>()
  const emailCandidates: Array<{ index: number; score: number }> = []
  const nameCandidates: Array<{ index: number; score: number }> = []
  const swimCloudCandidates: Array<{ index: number; score: number }> = []

  cells.forEach((cell, index) => {
    const key = resolveHeaderField(cell)
    if (!key) return
    if (key === "email") {
      emailCandidates.push({ index, score: emailHeaderScore(cell) })
      return
    }
    if (key === "name") {
      const score = nameHeaderScore(cell)
      if (score == null) return
      nameCandidates.push({ index, score })
      return
    }
    if (key === "swimCloudId") {
      const score = swimCloudHeaderScore(cell)
      if (score == null) return
      swimCloudCandidates.push({ index, score })
      return
    }
    if (!map.has(key)) map.set(key, index)
  })

  if (emailCandidates.length > 0) {
    emailCandidates.sort((a, b) => b.score - a.score || a.index - b.index)
    map.set("email", emailCandidates[0].index)
  }
  if (nameCandidates.length > 0) {
    nameCandidates.sort((a, b) => b.score - a.score || a.index - b.index)
    map.set("name", nameCandidates[0].index)
  }
  if (swimCloudCandidates.length > 0) {
    // Several SwimCloud columns (a swimmer can have duplicate profiles): the best
    // by score, read in sheet order so the leftmost holds the main profile.
    swimCloudCandidates
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, MAX_SWIMCLOUD_IDS)
      .sort((a, b) => a.index - b.index)
      .forEach(({ index }, slot) => map.set(swimCloudColumnKey(slot), index))
  }

  return map
}

/** Parse CSV text into rows, respecting quoted fields and embedded newlines. */
export function parseCsvRecords(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = []
  let cur = ""
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(cur.trim())
      cur = ""
    } else if (ch === "\r") {
      // handled by following \n
    } else if (ch === "\n") {
      row.push(cur.trim())
      rows.push(row)
      row = []
      cur = ""
    } else {
      cur += ch
    }
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim())
    rows.push(row)
  }

  return rows
}

function parseGender(value: string): "M" | "F" | undefined {
  const g = value.trim().toUpperCase()
  if (g === "F" || g === "FEMALE" || g === "W" || g === "WOMEN" || g === "GIRL") {
    return "F"
  }
  if (g === "M" || g === "MALE" || g === "MEN" || g === "BOY") {
    return "M"
  }
  return undefined
}

function swimCloudColumnKey(slot: number): string {
  return `swimCloudId:${slot}`
}

/** Every SwimCloud ID in the row's SwimCloud columns, left to right, deduped. */
function rowSwimCloudIds(row: string[], headers: Map<string, number>): number[] {
  const ids: number[] = []
  for (let slot = 0; slot < MAX_SWIMCLOUD_IDS; slot++) {
    // Pieces that aren't an ID or profile link ("N/A", notes) are ignored.
    for (const id of parseSwimCloudProfileList(cell(row, headers, swimCloudColumnKey(slot))).ids) {
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

function cell(row: string[], headers: Map<string, number>, key: string): string {
  const index = headers.get(key)
  if (index == null || index >= row.length) return ""
  const value = row[index]
  if (value == null) return ""
  return String(value).trim()
}

function parseDob(value: string): Date | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return undefined
  // A DOB in the current year is a placeholder (e.g. a sheet's default date), not a real birthday.
  const currentYear = new Date().getFullYear()
  if (date.getFullYear() === currentYear || date.getUTCFullYear() === currentYear) return undefined
  return date
}

/** Parse a roster CSV into athlete rows. */
export function parseRosterCsv(text: string): RosterCsvParseResult {
  return parseRosterRecords(parseCsvRecords(text))
}

/**
 * Parse already-tokenized rows (e.g. a Google Sheets API `values` grid) into
 * athlete rows — shares all header-mapping/validation logic with parseRosterCsv,
 * which just adds the CSV-text tokenization step in front of this.
 */
export function parseRosterRecords(rawRecords: string[][]): RosterCsvParseResult {
  const records = rawRecords.filter((cells) => cells.some((c) => c.trim()))

  if (records.length === 0) {
    return { rows: [], errors: [{ row: 1, message: "CSV is empty" }] }
  }

  const headerCells = records[0]
  const headers = mapHeaders(headerCells)
  const hasNameColumn =
    headers.has("name") || headers.has("firstName") || headers.has("lastName")
  if (!hasNameColumn) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message:
            'Missing name columns — headers should contain "first name", "last name", or "full name"',
        },
      ],
    }
  }
  if (!headers.has("gender")) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: 'Missing gender column — headers should contain "gender" or "sex"',
        },
      ],
    }
  }

  const rows: ParsedRosterCsvRow[] = []
  const errors: RosterCsvParseResult["errors"] = []

  for (let i = 1; i < records.length; i++) {
    const rowNumber = i + 1
    const cells = records[i]

    const firstNameRaw = cell(cells, headers, "firstName")
    const lastNameRaw = cell(cells, headers, "lastName")
    const nameRaw = stripTrailingSignedDate(cell(cells, headers, "name"))
    let firstName = ""
    let lastName = ""
    let parsedPreferredName: string | null = null

    if (nameRaw.trim()) {
      const parsed = parseRosterName(nameRaw)
      if (parsed.firstName && parsed.lastName) {
        firstName = parsed.firstName
        lastName = parsed.lastName
        parsedPreferredName = parsed.preferredName
      }
    }

    if (firstNameRaw.trim()) {
      const parsed = parseFirstNameWithPreferredName(firstNameRaw)
      firstName = parsed.firstName || firstName
      parsedPreferredName = parsed.preferredName ?? parsedPreferredName
    }
    if (lastNameRaw.trim()) {
      lastName = lastNameRaw.trim()
    }

    if (!nameRaw.trim() && !firstNameRaw.trim() && !lastNameRaw.trim()) {
      continue
    }

    if (!firstName || !lastName) {
      errors.push({ row: rowNumber, message: "Missing first or last name" })
      continue
    }

    // Only GT emails are imported; other domains are ignored for that row.
    const email = normalizeGatechEmail(cell(cells, headers, "email")) ?? undefined
    const gtid = cell(cells, headers, "gtid") || undefined
    const dob = parseDob(cell(cells, headers, "dob"))
    const year = cell(cells, headers, "year") || undefined

    const genderRaw = cell(cells, headers, "gender")
    const gender = parseGender(genderRaw)
    if (!genderRaw.trim()) {
      errors.push({ row: rowNumber, message: "Missing gender" })
      continue
    }
    if (!gender) {
      errors.push({ row: rowNumber, message: `Invalid gender "${genderRaw.trim()}"` })
      continue
    }

    // An explicit preferred-name column wins over a "First (Pref)" parenthetical.
    const preferredName =
      normalizePreferredName(cell(cells, headers, "preferredName")) ?? parsedPreferredName
    const swimCloudIds = rowSwimCloudIds(cells, headers)
    if (swimCloudIds.length > MAX_SWIMCLOUD_IDS) {
      errors.push({
        row: rowNumber,
        message: `More than ${MAX_SWIMCLOUD_IDS} SwimCloud IDs; kept the first ${MAX_SWIMCLOUD_IDS}`,
      })
    }

    rows.push({
      rowNumber,
      firstName,
      lastName,
      gender,
      ...(email ? { email } : {}),
      ...(gtid ? { gtid } : {}),
      ...(dob ? { dob } : {}),
      ...(year ? { year } : {}),
      ...(swimCloudIds.length > 0
        ? { swimCloudIds: swimCloudIds.slice(0, MAX_SWIMCLOUD_IDS) }
        : {}),
      preferredName,
    })
  }

  return { rows, errors }
}

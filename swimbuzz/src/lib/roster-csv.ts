import { normalizeNicknames, parseFirstNameWithNicknames, parseRosterName } from "@/lib/athlete-match"

export type ParsedRosterCsvRow = {
  rowNumber: number
  firstName: string
  lastName: string
  email?: string
  gender: "M" | "F"
  swimCloudId?: number
  nicknames: string[]
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

  if (compact.includes("swimcloud") || h.includes("swimmer id")) return "swimCloudId"
  if (h.includes("nickname") || h.includes("alternate name")) return "nicknames"
  if (h.includes("first name") || compact === "firstname" || h === "first") {
    return "firstName"
  }
  if (h.includes("last name") || compact === "lastname" || h === "last") {
    return "lastName"
  }
  if (h.includes("full name") || compact === "fullname") return "name"
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

  const looksLikeName =
    h === "name" ||
    h.endsWith(" name") ||
    h.startsWith("name ") ||
    h.includes(" name ")
  if (
    looksLikeName &&
    !h.includes("first") &&
    !h.includes("last") &&
    !h.includes("nick") &&
    !h.includes("user") &&
    !h.includes("team")
  ) {
    return "name"
  }

  return undefined
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

  cells.forEach((cell, index) => {
    const key = resolveHeaderField(cell)
    if (!key) return
    if (key === "email") {
      emailCandidates.push({ index, score: emailHeaderScore(cell) })
      return
    }
    if (!map.has(key)) map.set(key, index)
  })

  if (emailCandidates.length > 0) {
    emailCandidates.sort((a, b) => b.score - a.score || a.index - b.index)
    map.set("email", emailCandidates[0].index)
  }

  return map
}

/** Parse CSV text into rows, respecting quoted fields and embedded newlines. */
function parseCsvRecords(text: string): string[][] {
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

function cell(row: string[], headers: Map<string, number>, key: string): string {
  const index = headers.get(key)
  if (index == null || index >= row.length) return ""
  return row[index].trim()
}

/** Parse a roster CSV into athlete rows. */
export function parseRosterCsv(text: string): RosterCsvParseResult {
  const records = parseCsvRecords(text).filter((cells) => cells.some((c) => c.trim()))

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
    const nameRaw = cell(cells, headers, "name")
    let firstName = ""
    let lastName = ""
    let parsedNicknames: string[] = []

    if (nameRaw.trim()) {
      const parsed = parseRosterName(nameRaw)
      if (parsed.firstName && parsed.lastName) {
        firstName = parsed.firstName
        lastName = parsed.lastName
        parsedNicknames = parsed.nicknames
      }
    }

    if (firstNameRaw.trim()) {
      const parsed = parseFirstNameWithNicknames(firstNameRaw)
      firstName = parsed.firstName || firstName
      parsedNicknames = normalizeNicknames([...parsedNicknames, ...parsed.nicknames])
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

    const emailRaw = cell(cells, headers, "email").toLowerCase()
    const email = emailRaw && emailRaw.includes("@") ? emailRaw : undefined

    const swimCloudRaw = cell(cells, headers, "swimCloudId")
    const swimCloudId = swimCloudRaw ? parseInt(swimCloudRaw, 10) : undefined
    if (swimCloudRaw && (!swimCloudId || swimCloudId <= 0)) {
      errors.push({ row: rowNumber, message: "Invalid SwimCloud ID" })
      continue
    }

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

    const nicknames = normalizeNicknames([
      ...parsedNicknames,
      ...normalizeNicknames(cell(cells, headers, "nicknames")),
    ])

    rows.push({
      rowNumber,
      firstName,
      lastName,
      gender,
      ...(email ? { email } : {}),
      ...(swimCloudId ? { swimCloudId } : {}),
      nicknames,
    })
  }

  return { rows, errors }
}

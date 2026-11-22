import {
  buildAthleteLookup,
  isRejectedPdfName,
  matchAthleteIdFast,
  type RosterAthlete,
} from "@/lib/athlete/athlete-match"
import type { ClearanceUpdate } from "@/lib/athlete/athlete-clearance"
import { normalizeGtid } from "@/lib/practice/practice-attendance"

/**
 * Physical & concussion clearance import (Google Sheet / CSV). Column layout is
 * unknown, so headers are auto-detected and staff confirm the mapping before
 * anything is matched or saved. Cells may hold yes/no values or a date (a dated
 * check counts as done). Only completion status is saved — never the date.
 */

export const CLEARANCE_COLUMN_ROLES = [
  "gtid",
  "email",
  "fullName",
  "firstName",
  "lastName",
  "physical",
  "concussion",
] as const

export type ClearanceColumnRole = (typeof CLEARANCE_COLUMN_ROLES)[number]

/** Column index per role; a role left out isn't read. */
export type ClearanceColumns = Partial<Record<ClearanceColumnRole, number>>

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

function headerRole(h: string): ClearanceColumnRole | null {
  if (!h || /\btimestamp\b/.test(h)) return null
  const physical = /\bphysicals?\b|pre ?participation|\bppe\b|medical (clearance|form|exam)/.test(h)
  const concussion = /concussion|impact test|\bimpact\b|baseline/.test(h)
  // A column naming both checks is ambiguous — staff map it themselves.
  if (physical && concussion) return null
  if (concussion) return "concussion"
  if (physical) return "physical"
  if (/\bgt ?id\b|\bgtid\b|student (id|number)|\bgt ?#|buzz ?card/.test(h)) return "gtid"
  if (/e ?mail/.test(h)) return "email"
  if (/^(first|first name|firstname|given name|preferred first name|legal first name)$/.test(h)) return "firstName"
  if (/^(last|last name|lastname|surname|family name|legal last name)$/.test(h)) return "lastName"
  if (/^(name|full name|athlete|athlete name|swimmer|swimmer name|student|student name|member name|name \(first last\))$/.test(h)) {
    return "fullName"
  }
  return null
}

/** Auto-detect columns from a header row (first matching column per role wins). */
export function detectClearanceColumns(headers: string[]): ClearanceColumns {
  const columns: ClearanceColumns = {}
  headers.forEach((raw, index) => {
    const role = headerRole(normalizeHeader(raw))
    if (role && columns[role] == null) columns[role] = index
  })
  return columns
}

function detectedScore(columns: ClearanceColumns): number {
  const ids = ["gtid", "email", "fullName", "firstName", "lastName"].filter((r) => columns[r as ClearanceColumnRole] != null).length
  const checks = ["physical", "concussion"].filter((r) => columns[r as ClearanceColumnRole] != null).length
  return ids > 0 && checks > 0 ? ids + checks * 2 : ids + checks
}

/** The header row: the best-scoring of the first ten non-empty rows (title rows above it are skipped). */
export function findClearanceHeaderRow(records: string[][]): number {
  let best = 0
  let bestScore = -1
  records.slice(0, 10).forEach((row, index) => {
    const score = detectedScore(detectClearanceColumns(row))
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  return best
}

export function nonEmptyRecords(values: string[][]): string[][] {
  return values.filter((cells) => cells.some((c) => (c ?? "").trim()))
}

/** Whether a mapping can be imported; returns the problem, or null. */
export function clearanceColumnsProblem(columns: ClearanceColumns): string | null {
  const hasId =
    columns.gtid != null ||
    columns.email != null ||
    columns.fullName != null ||
    columns.firstName != null ||
    columns.lastName != null
  if (!hasId) return "Choose a GTID, email or name column to match athletes by"
  const hasCheck = columns.physical != null || columns.concussion != null
  if (!hasCheck) return "Choose a physical or concussion test column"
  return null
}

/** Validate a mapping sent back by the client against the header width. */
export function normalizeClearanceColumns(raw: unknown, width: number): ClearanceColumns | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const out: ClearanceColumns = {}
  for (const role of CLEARANCE_COLUMN_ROLES) {
    const value = (raw as Record<string, unknown>)[role]
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < width) out[role] = value
  }
  return out
}

// ── Cell values ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

function dayKey(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** Find a calendar date in a cell ("2026-08-15", "8/15/2026", "8/15/26", "Aug 15, 2026", "15 Aug 2026"). */
export function parseClearanceDate(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  if (!value) return null
  let m = value.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (m) return dayKey(Number(m[1]), Number(m[2]), Number(m[3]))
  m = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/)
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return dayKey(year, Number(m[1]), Number(m[2]))
  }
  m = value.match(/\b([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\b/)
  if (m && MONTHS[m[1].slice(0, m[1] === "sept" ? 4 : 3)]) {
    return dayKey(Number(m[3]), MONTHS[m[1].slice(0, m[1] === "sept" ? 4 : 3)]!, Number(m[2]))
  }
  m = value.match(/\b(\d{1,2}) ([a-z]{3,9})\.?,? (\d{4})\b/)
  if (m && MONTHS[m[2].slice(0, 3)]) return dayKey(Number(m[3]), MONTHS[m[2].slice(0, 3)]!, Number(m[1]))
  return null
}

const NO_RE = /^(no|n|false|0|not done|not cleared|not complete(d)?|incomplete|missing|pending|needed|needs?|outstanding|not submitted|not received|none|✗|✘|×)$/
const YES_RE = /^(yes|y|true|1|x|✓|✔|✔️|☑|☑️|done|complete(d)?|cleared|submitted|received|on file|ok|okay|passed|pass|taken|turned in|uploaded|approved|have|has)$/
const BLANK_RE = /^(-+|—|–|n\/?a|tbd|\?)$/

export type ClearanceCell =
  | { kind: "blank" }
  | { kind: "value"; cleared: boolean }
  | { kind: "unknown"; raw: string }

/** Read a status cell: yes/no words, checkmarks, or a date (done; the date itself isn't kept). */
export function parseClearanceCell(raw: string): ClearanceCell {
  const value = raw.trim()
  const lower = value.toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ")
  if (!lower || BLANK_RE.test(lower)) return { kind: "blank" }
  if (NO_RE.test(lower) || /^(no|not)\b/.test(lower)) return { kind: "value", cleared: false }
  if (parseClearanceDate(value)) return { kind: "value", cleared: true }
  if (YES_RE.test(lower) || /^(yes|done|complete|cleared)\b/.test(lower)) return { kind: "value", cleared: true }
  return { kind: "unknown", raw: value }
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export type ClearanceRowItem = { cleared: boolean }

export type ParsedClearanceRow = {
  rowNumber: number
  /** "Last, First" when split columns are used, else the name cell. */
  name: string
  gtid: string | null
  email: string | null
  /** Null = the sheet says nothing for this check (leave it as is). */
  physical: ClearanceRowItem | null
  concussion: ClearanceRowItem | null
}

function cellAt(row: string[], index: number | undefined): string {
  return index == null ? "" : (row[index] ?? "").trim()
}

function readCheck(
  row: string[],
  statusIndex: number | undefined,
  label: string,
  who: string,
  warnings: string[]
): ClearanceRowItem | null {
  if (statusIndex == null) return null
  const status = parseClearanceCell(cellAt(row, statusIndex))
  if (status.kind === "unknown") {
    warnings.push(`${who}: "${status.raw}" isn't yes/no or a date for the ${label} — left as it was`)
  }
  return status.kind === "value" ? { cleared: status.cleared } : null
}

function rowLabel(row: Pick<ParsedClearanceRow, "name" | "gtid" | "email" | "rowNumber">): string {
  const [last, first] = row.name.split(",").map((s) => s.trim())
  const name = first && last ? `${first} ${last}` : row.name
  return name || row.email || (row.gtid ? `GTID ${row.gtid}` : `Row ${row.rowNumber}`)
}

/** Parse the grid under the header row with a confirmed mapping. */
export function parseClearanceRows(
  records: string[][],
  headerRow: number,
  columns: ClearanceColumns
): { rows: ParsedClearanceRow[]; warnings: string[] } {
  const rows: ParsedClearanceRow[] = []
  const warnings: string[] = []
  records.slice(headerRow + 1).forEach((row, i) => {
    const first = cellAt(row, columns.firstName)
    const last = cellAt(row, columns.lastName)
    const name = first && last ? `${last}, ${first}` : cellAt(row, columns.fullName) || first || last
    const gtidRaw = cellAt(row, columns.gtid)
    const gtid = gtidRaw ? normalizeGtid(gtidRaw) : null
    const emailRaw = cellAt(row, columns.email).toLowerCase()
    const email = emailRaw.includes("@") ? emailRaw : null
    if (!name && !gtid && !email) return

    const base = { rowNumber: headerRow + i + 2, name, gtid, email }
    const who = rowLabel(base)
    rows.push({
      ...base,
      physical: readCheck(row, columns.physical, "physical", who, warnings),
      concussion: readCheck(row, columns.concussion, "concussion test", who, warnings),
    })
  })
  return { rows, warnings }
}

export type ClearanceRosterAthlete = RosterAthlete & {
  gtid: string | null
  email: string | null
}

export type UnmatchedClearanceRow = { rowNumber: number; label: string }

export type ClearanceImportResolution = {
  updates: Map<string, ClearanceUpdate>
  /** Names (rows with a name) that matched no athlete — offered for pairing. */
  unmatchedNames: string[]
  /** Every row left unmatched (after pairing), for the result list. */
  unmatchedRows: UnmatchedClearanceRow[]
  /** Matched rows the sheet said nothing about. */
  noData: number
}

/** Match rows to the season roster by GTID, then email, then name (plus coach pairings). */
export function resolveClearanceImport(
  rows: ParsedClearanceRow[],
  roster: ClearanceRosterAthlete[],
  nameMappings: Record<string, string> | null,
  rejectedNames: string[] | null
): ClearanceImportResolution {
  const lookup = buildAthleteLookup(roster)
  const byGtid = new Map<string, string>()
  const byEmail = new Map<string, string>()
  for (const athlete of roster) {
    const gtid = athlete.gtid ? normalizeGtid(athlete.gtid) : null
    if (gtid && !byGtid.has(gtid)) byGtid.set(gtid, athlete.id)
    if (athlete.email) byEmail.set(athlete.email.toLowerCase(), athlete.id)
  }
  const onRoster = new Set(roster.map((a) => a.id))

  const updates = new Map<string, ClearanceUpdate>()
  const unmatchedNames: string[] = []
  const unmatchedRows: UnmatchedClearanceRow[] = []
  let noData = 0

  for (const row of rows) {
    const matched =
      (row.gtid ? byGtid.get(row.gtid) : undefined) ??
      (row.email ? byEmail.get(row.email) : undefined) ??
      (row.name ? matchAthleteIdFast(row.name, lookup, nameMappings) : null)
    const athleteId = matched && onRoster.has(matched) ? matched : null
    if (!athleteId) {
      if (row.name && !isRejectedPdfName(row.name, rejectedNames)) unmatchedNames.push(row.name)
      unmatchedRows.push({ rowNumber: row.rowNumber, label: rowLabel(row) })
      continue
    }
    if (!row.physical && !row.concussion) {
      noData += 1
      continue
    }
    // Later rows for the same athlete win, check by check.
    const update = updates.get(athleteId) ?? {}
    if (row.physical) update.physical = { cleared: row.physical.cleared }
    if (row.concussion) update.concussion = { cleared: row.concussion.cleared }
    updates.set(athleteId, update)
  }

  return { updates, unmatchedNames, unmatchedRows, noData }
}

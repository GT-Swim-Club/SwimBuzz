import {
  buildAthleteLookup,
  isRejectedPdfName,
  matchAthleteIdFast,
  type RosterAthlete,
} from "@/lib/athlete/athlete-match"
import type { ClearanceUpdate } from "@/lib/athlete/athlete-clearance"

/**
 * Clearance imports from two CSVs, completion status only:
 * - Physicals: Ideal Logic's medical clearance spreadsheet (Members → Members → Select
 *   Incomplete → Medical Clearance → Download Spreadsheet), `Status, Person, Position, Dates`.
 *   It lists only members without a physical ("Not OK"), so anyone on the season roster who
 *   isn't listed is complete.
 * - Concussion tests: the club sports SWAY tracker, `Name, SWAY Status, Entered in IL, …`
 *   (a title row may sit above the header). It lists everyone; "Complete" is done, anything
 *   else (Not Started, Retake, Incomplete-Retake, blank) isn't, and anyone on the roster who
 *   isn't listed is incomplete.
 */

export type ClearanceImportKind = "physical" | "concussion"

export function parseClearanceImportKind(raw: string | null): ClearanceImportKind | null {
  if (raw == null || raw === "physical") return "physical"
  return raw === "concussion" ? "concussion" : null
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ")
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ")
}

type ImportFormat = {
  nameHeader: string
  statusHeader: string
  /** Read a status cell (normalized); `known` false adds a warning. */
  readStatus: (status: string) => { cleared: boolean; known: boolean }
  /** What a roster athlete missing from the file gets. */
  notListedCleared: boolean
  missingHeaderError: string
}

const FORMATS: Record<ClearanceImportKind, ImportFormat> = {
  physical: {
    nameHeader: "person",
    statusHeader: "status",
    readStatus: (s) => ({ cleared: s === "ok", known: s === "" || s === "ok" || s === "not ok" }),
    notListedCleared: true,
    missingHeaderError: "This isn't Ideal Logic's medical clearance spreadsheet — it has no Person column",
  },
  concussion: {
    nameHeader: "name",
    statusHeader: "sway status",
    readStatus: (s) => ({
      cleared: s === "complete",
      known: /^(|complete|not started|retake|incomplete(-retake)?|incomplete)$/.test(s),
    }),
    notListedCleared: false,
    missingHeaderError: "This isn't the SWAY tracker — it needs Name and SWAY Status columns",
  },
}

export type ClearanceImportColumns = { name: number; status: number | null }

/** The header row (first of the top ten with the format's name column) and its columns. */
export function findClearanceImportHeader(
  kind: ClearanceImportKind,
  records: string[][]
): { headerRow: number; columns: ClearanceImportColumns } | null {
  const format = FORMATS[kind]
  for (let i = 0; i < Math.min(records.length, 10); i++) {
    const headers = records[i].map(normalizeHeader)
    const name = headers.indexOf(format.nameHeader)
    const status = headers.indexOf(format.statusHeader)
    if (name < 0) continue
    // The SWAY sheet needs its status column; Ideal Logic's is only ever "Not OK".
    if (kind === "concussion" && status < 0) continue
    return { headerRow: i, columns: { name, status: status < 0 ? null : status } }
  }
  return null
}

export function clearanceImportHeaderError(kind: ClearanceImportKind): string {
  return FORMATS[kind].missingHeaderError
}

export type ParsedClearanceRow = {
  rowNumber: number
  /** "Last, First (Preferred)". */
  name: string
  cleared: boolean
}

/** Rows under the header with a name. */
export function parseClearanceImportRows(
  kind: ClearanceImportKind,
  records: string[][],
  headerRow: number,
  columns: ClearanceImportColumns
): { rows: ParsedClearanceRow[]; warnings: string[] } {
  const format = FORMATS[kind]
  const rows: ParsedClearanceRow[] = []
  const warnings: string[] = []
  records.slice(headerRow + 1).forEach((row, i) => {
    const name = (row[columns.name] ?? "").trim()
    if (!name) return
    const status = columns.status == null ? "" : (row[columns.status] ?? "").trim()
    const { cleared, known } = format.readStatus(normalizeStatus(status))
    if (!known) warnings.push(`${displayName(name)}: status "${status}" read as incomplete`)
    rows.push({ rowNumber: headerRow + i + 2, name, cleared })
  })
  return { rows, warnings }
}

/** "Bohannan, Bradley (Brad)" → "Bradley Bohannan". */
function displayName(name: string): string {
  const [last, ...rest] = name.split(",")
  const first = rest.join(",").replace(/\([^)]*\)/g, "").trim()
  return first && last.trim() ? `${first} ${last.trim()}` : name
}

/** "Last, First (Preferred)" → "Last, Preferred", for rosters that only know the preferred name. */
function preferredVariant(name: string): string | null {
  const m = name.match(/^([^,]+),[^()]*\(([^)]+)\)\s*$/)
  return m ? `${m[1].trim()}, ${m[2].split(",")[0].trim()}` : null
}

export type ClearanceRosterAthlete = RosterAthlete

export type UnmatchedClearanceRow = { rowNumber: number; label: string }

export type ClearanceImportResolution = {
  updates: Map<string, ClearanceUpdate>
  /** Names that matched no athlete — candidates for pairing. */
  unmatchedNames: string[]
  /** Every row left unmatched (after pairing), for the result list. */
  unmatchedRows: UnmatchedClearanceRow[]
  /** Roster athletes marked incomplete. */
  incomplete: number
  /** Roster athletes marked complete. */
  complete: number
}

/** Match rows to the season roster by name (plus coach pairings); every roster athlete gets a value. */
export function resolveClearanceImport(
  kind: ClearanceImportKind,
  rows: ParsedClearanceRow[],
  roster: ClearanceRosterAthlete[],
  nameMappings: Record<string, string> | null,
  rejectedNames: string[] | null
): ClearanceImportResolution {
  const lookup = buildAthleteLookup(roster)
  const onRoster = new Set(roster.map((a) => a.id))
  const listed = new Map<string, boolean>()
  const unmatchedNames: string[] = []
  const unmatchedRows: UnmatchedClearanceRow[] = []

  for (const row of rows) {
    const variant = preferredVariant(row.name)
    const matched =
      matchAthleteIdFast(row.name, lookup, nameMappings) ??
      (variant ? matchAthleteIdFast(variant, lookup, nameMappings) : null)
    const athleteId = matched && onRoster.has(matched) ? matched : null
    if (!athleteId) {
      if (!isRejectedPdfName(row.name, rejectedNames)) unmatchedNames.push(row.name)
      unmatchedRows.push({ rowNumber: row.rowNumber, label: displayName(row.name) })
      continue
    }
    // Listed twice: any complete row wins.
    listed.set(athleteId, (listed.get(athleteId) ?? false) || row.cleared)
  }

  const notListed = FORMATS[kind].notListedCleared
  const updates = new Map<string, ClearanceUpdate>()
  let incomplete = 0
  for (const athlete of roster) {
    const cleared = listed.get(athlete.id) ?? notListed
    if (!cleared) incomplete += 1
    updates.set(athlete.id, { [kind]: { cleared } })
  }

  return { updates, unmatchedNames, unmatchedRows, incomplete, complete: roster.length - incomplete }
}

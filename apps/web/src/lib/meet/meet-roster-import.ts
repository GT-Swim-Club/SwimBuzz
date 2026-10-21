import {
  buildAthleteLookup,
  isRejectedPdfName,
  matchAthleteIdFast,
  type RosterAthlete,
} from "@/lib/athlete/athlete-match"
import { isEditableSignupSheetSeed } from "@/lib/meet/meet-signup"
import type { SheetEntry, SheetSummary } from "@/lib/meet/meet-sheet-summary"
import { normalizeEventName } from "@/lib/swim/swim-parse"

/**
 * Final meet roster import (the coaches' roster sheet, after drops and roster
 * cuts). Only athletes on it stay on the roster summary; it also limits the
 * relay builder's athlete pool. Rows it drops are kept on the roster and come
 * back when it's cleared or replaced.
 */

export type MeetFinalRoster = {
  importedAt: string
  athleteIds: string[]
  /** Summary rows (sign-ups, seeds) for athletes off the roster, restored when it's cleared. */
  removedEntries?: SheetEntry[]
}

export function isMeetFinalRoster(value: unknown): value is MeetFinalRoster {
  if (!value || typeof value !== "object") return false
  const roster = value as MeetFinalRoster
  return (
    typeof roster.importedAt === "string" &&
    Array.isArray(roster.athleteIds) &&
    roster.athleteIds.every((id) => typeof id === "string") &&
    (roster.removedEntries === undefined || Array.isArray(roster.removedEntries))
  )
}

export type ParsedMeetRosterRow = {
  rowNumber: number
  /** "Last, First" so multi-word last names survive name matching. */
  name: string
  /** From a "WOMENS ROSTER" / "MENS ROSTER" header; absent for a plain name list. */
  gender?: "M" | "F"
}

export type MeetRosterParseResult = {
  rows: ParsedMeetRosterRow[]
  error?: string
}

type NameColumns = { first: number; last?: number; gender?: "M" | "F" }

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

function rosterHeaderGender(header: string): "M" | "F" | undefined {
  if (/\b(women'?s?|female|girls?)\b/.test(header)) return "F"
  if (/\b(men'?s?|male|boys?)\b/.test(header)) return "M"
  return undefined
}

/**
 * Roster layout: a header row with "WOMENS ROSTER" / "MENS ROSTER" cells, each
 * heading a first-name column with last names in the column to its right.
 * DROP / Waitlist / Driving? columns are ignored.
 */
function findRosterColumns(records: string[][]): { headerRow: number; columns: NameColumns[] } | null {
  for (let r = 0; r < records.length; r++) {
    const columns: NameColumns[] = []
    records[r].forEach((raw, index) => {
      const h = normalizeHeader(raw)
      if (/\broster\b/.test(h)) columns.push({ first: index, last: index + 1, gender: rosterHeaderGender(h) })
    })
    if (columns.length > 0) return { headerRow: r, columns }
  }
  return null
}

/** Fallback layout: a plain list with "First Name" + "Last Name" (or "Name") headers. */
function findNameListColumns(records: string[][]): { headerRow: number; columns: NameColumns[] } | null {
  for (let r = 0; r < records.length; r++) {
    let first: number | undefined
    let last: number | undefined
    let full: number | undefined
    records[r].forEach((raw, index) => {
      const h = normalizeHeader(raw)
      if (h === "first name" || h === "first" || h === "firstname") first ??= index
      else if (h === "last name" || h === "last" || h === "lastname") last ??= index
      else if (h === "name" || h === "full name" || h === "athlete name" || h === "swimmer name") full ??= index
    })
    if (first != null && last != null) return { headerRow: r, columns: [{ first, last }] }
    if (full != null) return { headerRow: r, columns: [{ first: full }] }
  }
  return null
}

/** A name cell has letters (skips the trailing count rows some sheets carry). */
function nameCell(row: string[], index: number | undefined): string {
  const value = index == null ? "" : (row[index] ?? "").trim()
  return /\p{L}/u.test(value) ? value : ""
}

/** Parse a roster grid into athlete names (women's and men's columns, in sheet order). */
export function parseMeetRosterRecords(values: string[][]): MeetRosterParseResult {
  const records = values.filter((cells) => cells.some((c) => c.trim()))
  if (records.length === 0) return { rows: [], error: "The sheet is empty" }

  const layout = findRosterColumns(records) ?? findNameListColumns(records)
  if (!layout) {
    return {
      rows: [],
      error: "No roster columns found (e.g. \"Womens Roster\" / \"Mens Roster\", or First & Last Name)",
    }
  }

  const rows: ParsedMeetRosterRow[] = []
  for (const column of layout.columns) {
    records.slice(layout.headerRow + 1).forEach((row, i) => {
      const first = nameCell(row, column.first)
      const last = nameCell(row, column.last)
      const name = first && last ? `${last}, ${first}` : first || last
      if (!name) return
      rows.push({ rowNumber: layout.headerRow + i + 2, name, gender: column.gender })
    })
  }

  if (rows.length === 0) return { rows: [], error: "No athletes found under the roster columns" }
  return { rows }
}

export type MeetRosterAthlete = RosterAthlete & { gender: "M" | "F" }

export type MeetRosterImportResolution = {
  athletes: MeetRosterAthlete[]
  /** Row names that matched no athlete (before coach pairing). */
  unmatchedNames: string[]
  /** Rows the coach chose to leave unpaired. */
  rejected: number
  warnings: string[]
}

/** Match roster rows to the season roster by name (plus any coach pairings). */
export function resolveMeetRosterImport(
  rows: ParsedMeetRosterRow[],
  roster: MeetRosterAthlete[],
  nameMappings: Record<string, string> | null,
  rejectedNames: string[] | null
): MeetRosterImportResolution {
  const lookup = buildAthleteLookup(roster)
  const byId = new Map(roster.map((a) => [a.id, a]))

  const athletes = new Map<string, MeetRosterAthlete>()
  const unmatchedNames: string[] = []
  const warnings: string[] = []
  let rejected = 0

  for (const row of rows) {
    const athleteId = matchAthleteIdFast(row.name, lookup, nameMappings)
    const athlete = athleteId ? byId.get(athleteId) : undefined
    if (!athlete) {
      if (isRejectedPdfName(row.name, rejectedNames)) rejected += 1
      else unmatchedNames.push(row.name)
      continue
    }
    if (row.gender && row.gender !== athlete.gender) {
      warnings.push(
        `${athlete.firstName} ${athlete.lastName} is listed on the ${row.gender === "F" ? "women's" : "men's"} roster`
      )
    }
    athletes.set(athlete.id, athlete)
  }

  return { athletes: [...athletes.values()], unmatchedNames, rejected, warnings }
}

/** Roster summary rows that come from sign-ups or coach seeds rather than a PDF import. */
function isRosterSeed(entry: SheetEntry): boolean {
  return entry.signupImport === true || entry.rosterOnly === true || isEditableSignupSheetSeed(entry)
}

function hasSummaryRow(entries: SheetEntry[], athleteId: string): boolean {
  return entries.some(
    (e) =>
      e.athleteId === athleteId &&
      (e.entryType === "individual" || e.isRelayLeadoff || e.rosterOnly === true)
  )
}

/**
 * Keep the roster summary to the final roster: drop seed rows (sign-up imports,
 * hand-added seeds, "Attending") for anyone not on it, and add "Attending" for
 * roster athletes with no row yet. PDF-imported rows and relays are never touched.
 */
export function applyMeetRosterToEntriesSummary(
  existing: SheetSummary | null | undefined,
  course: string,
  roster: Array<{ athleteId: string; athleteName: string; gender: "M" | "F" }>
): {
  summary: SheetSummary
  removedEntries: SheetEntry[]
  removedAthletes: number
  attendingAdded: number
} {
  const onRoster = new Set(roster.map((a) => a.athleteId))
  const removedEntries: SheetEntry[] = []

  const kept = (existing?.entries ?? []).filter((e) => {
    if (onRoster.has(e.athleteId) || e.entryType === "relay_team" || !isRosterSeed(e)) return true
    removedEntries.push(e)
    return false
  })

  const added: SheetEntry[] = []
  for (const athlete of roster) {
    if (hasSummaryRow(kept, athlete.athleteId)) continue
    added.push({
      athleteId: athlete.athleteId,
      athleteName: athlete.athleteName,
      event: "Attending",
      eventNumber: 0,
      entryType: "individual",
      manual: true,
      rosterOnly: true,
      rosterImport: true,
      gender: athlete.gender,
    })
  }

  return {
    summary: {
      sheetType: existing?.sheetType ?? "psych",
      course: existing?.course || course,
      entries: [...kept, ...added],
    },
    removedEntries,
    removedAthletes: new Set(removedEntries.map((e) => e.athleteId)).size,
    attendingAdded: added.length,
  }
}

/**
 * Undo a final roster on the summary: drop the "Attending" rows it added and
 * bring back the rows it removed (skipping any the athlete has since re-gained).
 */
export function removeMeetRosterFromEntriesSummary(
  existing: SheetSummary | null | undefined,
  course: string,
  roster: MeetFinalRoster | null
): SheetSummary {
  const entries = (existing?.entries ?? []).filter((e) => !e.rosterImport)
  const keys = new Set(entries.map((e) => `${e.athleteId}|${normalizeEventName(e.event)}`))
  for (const entry of roster?.removedEntries ?? []) {
    const key = `${entry.athleteId}|${normalizeEventName(entry.event)}`
    if (keys.has(key) || (entry.rosterOnly && hasSummaryRow(entries, entry.athleteId))) continue
    keys.add(key)
    entries.push(entry)
  }

  return {
    sheetType: existing?.sheetType ?? "psych",
    course: existing?.course || course,
    entries,
  }
}

export function buildMeetFinalRoster(athleteIds: string[], removedEntries: SheetEntry[]): MeetFinalRoster {
  return { importedAt: new Date().toISOString(), athleteIds, removedEntries }
}

import {
  buildAthleteLookup,
  isRejectedPdfName,
  matchAthleteIdFast,
  type RosterAthlete,
} from "@/lib/athlete/athlete-match"
import {
  applySeedTimeToRow,
  eventNumberForGender,
  isEditableSignupSheetSeed,
  type MeetSignupEventOption,
} from "@/lib/meet/meet-signup"
import type { SheetEntry, SheetSummary } from "@/lib/meet/meet-sheet-summary"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import { formatTime } from "@/lib/utils"

/**
 * Sign-up sheet import (Google Form responses exported to Sheets / CSV).
 * Individual events + entry times become roster summary seeds; relay preferences
 * are stored on the meet for the relay builder's athlete pool.
 */

export type SignupRelayPreferences = {
  importedAt: string
  athletes: Array<{ athleteId: string; relays: string[] }>
}

export function isSignupRelayPreferences(value: unknown): value is SignupRelayPreferences {
  if (!value || typeof value !== "object") return false
  const prefs = value as SignupRelayPreferences
  return (
    typeof prefs.importedAt === "string" &&
    Array.isArray(prefs.athletes) &&
    prefs.athletes.every(
      (a) =>
        typeof a.athleteId === "string" &&
        Array.isArray(a.relays) &&
        a.relays.every((r) => typeof r === "string")
    )
  )
}

type EventSlotColumns = { number?: number; time?: number; formatted?: number }

type SignupColumns = {
  firstName?: number
  lastName?: number
  fullName?: number
  /** Email columns, Georgia Tech address first. */
  emails: number[]
  relays?: number
  slots: Map<number, EventSlotColumns>
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

/** Map form headers like "Event Number 1", "Event 4 Number", "Event 2 Entry Time Formatted". */
export function resolveSignupColumns(headers: string[]): SignupColumns {
  const columns: SignupColumns = { emails: [], slots: new Map() }
  const gtEmails: number[] = []
  const otherEmails: number[] = []

  headers.forEach((raw, index) => {
    const h = normalizeHeader(raw)
    if (!h) return

    const eventSlot = /\bevent\b/.test(h) ? h.match(/\d+/)?.[0] : undefined
    if (eventSlot) {
      const slotNumber = Number(eventSlot)
      const slot = columns.slots.get(slotNumber) ?? {}
      if (h.includes("time")) {
        if (h.includes("formatted")) slot.formatted ??= index
        else slot.time ??= index
      } else if (h.includes("number") || h.includes("#")) {
        slot.number ??= index
      } else {
        return
      }
      columns.slots.set(slotNumber, slot)
      return
    }

    if (h.includes("relay")) {
      columns.relays ??= index
      return
    }
    if (h.includes("email")) {
      if (h.includes("georgia tech") || h.includes("gatech") || h.includes("gt ")) gtEmails.push(index)
      else otherEmails.push(index)
      return
    }
    if (h === "first name" || h === "first" || h === "firstname") {
      columns.firstName ??= index
      return
    }
    if (h === "last name" || h === "last" || h === "lastname") {
      columns.lastName ??= index
      return
    }
    if (h === "name" || h === "full name" || h === "athlete name" || h === "swimmer name") {
      columns.fullName ??= index
    }
  })

  columns.emails = [...gtEmails, ...otherEmails]
  return columns
}

/**
 * Normalize a form entry time. Returns "NT" for blank/NT, a display time
 * (e.g. "21.61", "1:05.29"), or null when the cell isn't a time. Handles
 * leading-zero minutes ("00:27.50") and Sheets day-fraction durations
 * ("0.0002501157407" → 21.61).
 */
export function parseSignupEntryTime(raw: string): string | null {
  const value = raw.trim()
  if (!value || /^nt$/i.test(value)) return "NT"

  let seconds: number | null = null
  const clock = value.match(/^(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (clock) {
    const sec = Number(clock[2])
    if (sec < 60) seconds = Number(clock[1]) * 60 + sec
  } else if (/^\d*\.?\d+$/.test(value)) {
    const n = Number(value)
    // Sheets stores durations as a fraction of a day; no real swim is under 1s.
    seconds = n > 0 && n < 1 ? n * 86400 : n
  }

  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null
  return formatTime(Math.round(seconds * 100) * 10)
}

export type ParsedSignupRow = {
  rowNumber: number
  /** "Last, First" so multi-word last names survive name matching. */
  name: string
  emails: string[]
  events: Array<{ number: number; time: string; invalidTime?: string }>
  relays: string[]
}

export type SignupParseResult = {
  rows: ParsedSignupRow[]
  error?: string
}

function cellAt(row: string[], index: number | undefined): string {
  return index == null ? "" : (row[index] ?? "").trim()
}

/** Parse a response grid (header row first) into sign-up rows. */
export function parseSignupRecords(values: string[][]): SignupParseResult {
  const records = values.filter((cells) => cells.some((c) => c.trim()))
  if (records.length < 2) return { rows: [], error: "The sheet has no responses" }

  const columns = resolveSignupColumns(records[0])
  const slots = [...columns.slots.entries()]
    .filter(([, slot]) => slot.number != null)
    .sort(([a], [b]) => a - b)
    .map(([, slot]) => slot)
  if (slots.length === 0) {
    return { rows: [], error: "No event number columns found (e.g. \"Event Number 1\")" }
  }
  const hasName =
    columns.fullName != null || (columns.firstName != null && columns.lastName != null)
  if (!hasName && columns.emails.length === 0) {
    return { rows: [], error: "No name or email columns found" }
  }

  const rows: ParsedSignupRow[] = []
  records.slice(1).forEach((row, i) => {
    const first = cellAt(row, columns.firstName)
    const last = cellAt(row, columns.lastName)
    const name = first && last ? `${last}, ${first}` : cellAt(row, columns.fullName) || first || last
    const emails = columns.emails
      .map((index) => cellAt(row, index).toLowerCase())
      .filter((email) => email.includes("@"))

    const events: ParsedSignupRow["events"] = []
    for (const slot of slots) {
      const number = Number(cellAt(row, slot.number).match(/^#?\s*(\d+)/)?.[1])
      if (!Number.isFinite(number) || number <= 0) continue
      // Prefer the "Formatted" column (the cleaned-up copy), then the raw answer.
      const candidates = [cellAt(row, slot.formatted), cellAt(row, slot.time)].filter(Boolean)
      const parsed = candidates.map(parseSignupEntryTime).find((t) => t != null)
      events.push(
        parsed != null ? { number, time: parsed } : { number, time: "NT", invalidTime: candidates[0] }
      )
    }

    const relays = cellAt(row, columns.relays)
      .split(/[,;\n]/)
      .map((r) => r.trim())
      .filter(Boolean)

    if (!name && emails.length === 0) return
    rows.push({ rowNumber: i + 2, name, emails, events, relays })
  })

  return { rows }
}

export type SignupRosterAthlete = RosterAthlete & {
  gender: "M" | "F"
  email: string | null
}

export type ImportedSignup = {
  athleteId: string
  athleteName: string
  gender: "M" | "F"
  events: Array<{ event: string; eventNumber: number; seedTime: string }>
  relays: string[]
}

export type SignupImportResolution = {
  signups: ImportedSignup[]
  /** Row names that matched no athlete (before coach pairing). */
  unmatchedNames: string[]
  /** Rows the coach chose to leave unpaired. */
  rejected: number
  warnings: string[]
}

function displayName(row: ParsedSignupRow): string {
  const [last, first] = row.name.split(",").map((s) => s.trim())
  return first && last ? `${first} ${last}` : row.name || row.emails[0] || `Row ${row.rowNumber}`
}

/** Match rows to the season roster (email, then name) and resolve event numbers. */
export function resolveSignupImport(
  rows: ParsedSignupRow[],
  roster: SignupRosterAthlete[],
  eventOptions: MeetSignupEventOption[],
  nameMappings: Record<string, string> | null,
  rejectedNames: string[] | null
): SignupImportResolution {
  const lookup = buildAthleteLookup(roster)
  const byId = new Map(roster.map((a) => [a.id, a]))
  const byEmail = new Map<string, string>()
  for (const athlete of roster) {
    if (athlete.email) byEmail.set(athlete.email.toLowerCase(), athlete.id)
  }

  // Later responses from the same athlete replace earlier ones.
  const signups = new Map<string, ImportedSignup>()
  const unmatchedNames: string[] = []
  const warnings: string[] = []
  let rejected = 0

  for (const row of rows) {
    const athleteId =
      row.emails.map((email) => byEmail.get(email)).find(Boolean) ??
      (row.name ? matchAthleteIdFast(row.name, lookup, nameMappings) : null)
    const athlete = athleteId ? byId.get(athleteId) : undefined
    if (!athlete) {
      if (row.name && isRejectedPdfName(row.name, rejectedNames)) rejected += 1
      else unmatchedNames.push(row.name || row.emails[0] || "")
      continue
    }

    const who = displayName(row)
    const events: ImportedSignup["events"] = []
    for (const { number, time, invalidTime } of row.events) {
      // Athletes often enter the other gender's number for the same event
      // (e.g. women's 5 for the men's 50 Free) — use their gender's version.
      const option =
        eventOptions.find((o) => eventNumberForGender(o, athlete.gender) === number) ??
        eventOptions.find((o) => eventNumberForGender(o, athlete.gender === "F" ? "M" : "F") === number)
      if (!option) {
        warnings.push(`${who}: event ${number} isn't in this meet's order of events — skipped`)
        continue
      }
      if (option.isRelay) {
        warnings.push(`${who}: event ${number} is a relay — skipped`)
        continue
      }
      if (events.some((e) => e.event === option.event)) continue
      if (invalidTime) warnings.push(`${who}: "${invalidTime}" isn't a time for event ${number} — used NT`)
      events.push({
        event: option.event,
        eventNumber: eventNumberForGender(option, athlete.gender) ?? number,
        seedTime: time,
      })
    }

    signups.delete(athlete.id)
    signups.set(athlete.id, {
      athleteId: athlete.id,
      athleteName: `${athlete.lastName}, ${athlete.firstName}`,
      gender: athlete.gender,
      events,
      relays: row.relays,
    })
  }

  return { signups: [...signups.values()], unmatchedNames, rejected, warnings }
}

function entryKey(athleteId: string, event: string): string {
  return `${athleteId}|${normalizeEventName(event)}`
}

/**
 * Replace the previous sign-up import in entriesSheetSummary. Hand-added seeds
 * for the same athlete + event are replaced by the imported row; PDF-imported
 * rows and relays are never touched.
 */
export function applySignupImportToEntriesSummary(
  existing: SheetSummary | null | undefined,
  course: string,
  signups: ImportedSignup[]
): { summary: SheetSummary; entries: number; attendingOnly: number } {
  const importedKeys = new Set(
    signups.flatMap((s) => s.events.map((e) => entryKey(s.athleteId, e.event)))
  )
  const importedAthletes = new Set(signups.map((s) => s.athleteId))

  const kept = (existing?.entries ?? []).filter((e) => {
    if (e.signupImport) return false
    // A signed-up athlete gets their own rows, so any "Attending" placeholder (from a roster
    // import or added by hand) goes. Checked before the seed test, which rejects these rows.
    if (e.rosterImport || e.rosterOnly) return !importedAthletes.has(e.athleteId)
    if (!isEditableSignupSheetSeed(e)) return true
    return !importedKeys.has(entryKey(e.athleteId, e.event))
  })

  const added: SheetEntry[] = []
  let attendingOnly = 0
  for (const signup of signups) {
    for (const { event, eventNumber, seedTime } of signup.events) {
      added.push(
        applySeedTimeToRow(
          {
            athleteId: signup.athleteId,
            athleteName: signup.athleteName,
            event,
            eventNumber,
            entryType: "individual",
            manual: true,
            signupImport: true,
          },
          seedTime
        )
      )
    }
    const onSummary =
      signup.events.length > 0 ||
      kept.some(
        (e) =>
          e.athleteId === signup.athleteId &&
          (e.entryType === "individual" || e.isRelayLeadoff || e.rosterOnly)
      )
    if (!onSummary) {
      attendingOnly += 1
      added.push({
        athleteId: signup.athleteId,
        athleteName: signup.athleteName,
        event: "Attending",
        eventNumber: 0,
        entryType: "individual",
        manual: true,
        rosterOnly: true,
        signupImport: true,
        gender: signup.gender,
      })
    }
  }

  return {
    summary: {
      sheetType: existing?.sheetType ?? "psych",
      course: existing?.course || course,
      entries: [...kept, ...added],
    },
    entries: added.length - attendingOnly,
    attendingOnly,
  }
}

/** Meet-level relay preferences for the relay builder's athlete pool. */
export function buildSignupRelayPreferences(signups: ImportedSignup[]): SignupRelayPreferences {
  return {
    importedAt: new Date().toISOString(),
    athletes: signups.map((s) => ({ athleteId: s.athleteId, relays: s.relays })),
  }
}

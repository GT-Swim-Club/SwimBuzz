import { prisma } from "@/lib/prisma"
import {
  collectMappedValues,
  parseTimestampValue,
  splitMultiValueCell,
  type ColumnMapping,
} from "@/lib/roster/form-import-columns"
import type { ImportRowMatch } from "@/lib/roster/form-import-match"
import {
  isValidSignupEntryTime,
  normalizeSignupEntryTime,
  type MeetSignupEventOption,
  type MeetSignupQuestion,
} from "@/lib/meet/meet-signup"
import { previewSignupEntryForAthlete, upsertSignupEntryForAthlete } from "@/lib/meet/meet-signup-mutations"
import { normalizeEventName } from "@/lib/swim/swim-parse"

export type ParsedSignupImportRow = {
  rowNumber: number
  rawName: string
  rawEmail: string
  timestamp: string
  events: string[]
  entryTimes: Record<string, string>
  answers: Record<string, string>
  notes: string
  warnings: string[]
}

export type SignupImportParseResult = {
  rows: ParsedSignupImportRow[]
  errors: Array<{ row: number; message: string }>
}

/**
 * Parse a Google Form response sheet into sign-up rows. `values` is the raw
 * grid (header row first); the returned `rowNumber` is the true sheet row
 * (header = row 1), so it lines up with what the coach sees in Sheets.
 */
export function parseSignupResponseRecords(
  values: string[][],
  mapping: ColumnMapping,
  ctx: { eventOptions: MeetSignupEventOption[]; questions: MeetSignupQuestion[]; askNotes: boolean }
): SignupImportParseResult {
  const headers = values[0] ?? []
  const records = values.slice(1)
  const eventByNormalized = new Map(ctx.eventOptions.map((o) => [normalizeEventName(o.event), o.event]))

  const rows: ParsedSignupImportRow[] = []
  const errors: SignupImportParseResult["errors"] = []
  const athleteKeyToIndex = new Map<string, number>()

  records.forEach((row, i) => {
    const rowNumber = i + 2
    if (!row.some((c) => c.trim())) return

    const mapped = collectMappedValues(headers, mapping, row)
    const rawName = (mapped.get("athleteName") ?? []).join(" ").trim()
    const rawEmail = (mapped.get("athleteEmail") ?? [])[0]?.trim() ?? ""
    const timestamp = (mapped.get("timestamp") ?? [])[0]?.trim() ?? ""

    if (!rawName && !rawEmail) {
      errors.push({ row: rowNumber, message: "No name or email in this row" })
      return
    }

    const warnings: string[] = []

    const rawEvents = (mapped.get("events") ?? []).flatMap(splitMultiValueCell)
    const events: string[] = []
    for (const rawEvent of rawEvents) {
      const matched = eventByNormalized.get(normalizeEventName(rawEvent))
      if (matched) {
        if (!events.includes(matched)) events.push(matched)
      } else {
        warnings.push(`Unknown event "${rawEvent}" was dropped`)
      }
    }

    const entryTimes: Record<string, string> = {}
    for (const event of events) {
      const key = `eventTime:${normalizeEventName(event)}`
      const raw = (mapped.get(key) ?? [])[0]?.trim() ?? ""
      if (!raw || !isValidSignupEntryTime(raw)) {
        entryTimes[event] = "NT"
        if (raw) warnings.push(`Invalid seed time for ${event} — used NT`)
      } else {
        entryTimes[event] = normalizeSignupEntryTime(raw)
      }
    }

    const answers: Record<string, string> = {}
    for (const q of ctx.questions) {
      const raw = (mapped.get(`question:${q.id}`) ?? [])[0]?.trim() ?? ""
      if (!raw) continue
      if (q.type === "choice" && !q.options.includes(raw)) {
        warnings.push(`Invalid answer for "${q.label}" was dropped`)
        continue
      }
      answers[q.id] = raw
    }

    const notes = ctx.askNotes ? (mapped.get("notes") ?? []).join("\n\n").trim() : ""

    const parsedRow: ParsedSignupImportRow = {
      rowNumber,
      rawName,
      rawEmail,
      timestamp,
      events,
      entryTimes,
      answers,
      notes,
      warnings,
    }

    const athleteKey = rawEmail.toLowerCase() || rawName.toLowerCase()
    const existingIndex = athleteKeyToIndex.get(athleteKey)
    if (existingIndex != null) {
      const existing = rows[existingIndex]
      const newTs = parseTimestampValue(timestamp)
      const oldTs = parseTimestampValue(existing.timestamp)
      const keepNew = newTs != null && oldTs != null ? newTs >= oldTs : true
      const kept = keepNew ? parsedRow : existing
      const droppedRow = keepNew ? existing.rowNumber : rowNumber
      kept.warnings.push(`Duplicate response for this athlete — row ${droppedRow} was dropped`)
      rows[existingIndex] = kept
      return
    }

    athleteKeyToIndex.set(athleteKey, rows.length)
    rows.push(parsedRow)
  })

  return { rows, errors }
}

export type SignupImportRowOutcome = {
  rowNumber: number
  athleteId: string | null
  outcome: "created" | "updated" | "skipped"
  warnings: string[]
}

/**
 * Apply (or, when `dryRun`, merely preview) parsed sign-up rows against the
 * meet's sign-up form. `matches` maps each row's `rowNumber` to its resolved
 * athlete (see form-import-match.ts) — rows with no match are skipped.
 */
export async function runSignupResponseImport(
  meetId: string,
  rows: ParsedSignupImportRow[],
  matches: Map<number, ImportRowMatch>,
  opts: { dryRun: boolean }
): Promise<{ created: number; updated: number; skipped: number; rowOutcomes: SignupImportRowOutcome[] }> {
  const form = await prisma.meetSignupForm.findUnique({ where: { meetId }, select: { id: true } })
  if (!form) throw new Error("Sign-up form not set up for this meet")

  const athleteIds = rows
    .map((r) => matches.get(r.rowNumber)?.athleteId)
    .filter((id): id is string => !!id)
  const existingEntries = athleteIds.length
    ? await prisma.meetSignupEntry.findMany({
        where: { formId: form.id, athleteId: { in: athleteIds } },
        select: { athleteId: true },
      })
    : []
  const existingSet = new Set(existingEntries.map((e) => e.athleteId))

  let created = 0
  let updated = 0
  let skipped = 0
  const rowOutcomes: SignupImportRowOutcome[] = []

  for (const row of rows) {
    const athleteId = matches.get(row.rowNumber)?.athleteId ?? null
    if (!athleteId) {
      skipped++
      rowOutcomes.push({ rowNumber: row.rowNumber, athleteId: null, outcome: "skipped", warnings: row.warnings })
      continue
    }

    const willCreate = !existingSet.has(athleteId)
    const data = { events: row.events, entryTimes: row.entryTimes, notes: row.notes, answers: row.answers }
    const warnings = [...row.warnings]

    if (opts.dryRun) {
      const preview = await previewSignupEntryForAthlete(form.id, data)
      warnings.push(...preview.warnings)
    } else {
      const result = await upsertSignupEntryForAthlete(form.id, athleteId, data)
      warnings.push(...result.warnings)
    }

    if (willCreate) created++
    else updated++
    rowOutcomes.push({
      rowNumber: row.rowNumber,
      athleteId,
      outcome: willCreate ? "created" : "updated",
      warnings,
    })
  }

  return { created, updated, skipped, rowOutcomes }
}

import { prisma } from "@/lib/prisma"
import { matchAthleteIdFast } from "@/lib/athlete-match"
import {
  collectMappedValues,
  parseTimestampValue,
  splitMultiValueCell,
  type ColumnMapping,
} from "@/lib/form-import-columns"
import type { FormImportRosterContext, ImportRowMatch } from "@/lib/form-import-match"
import type { MeetSignupQuestion } from "@/lib/meet-signup"
import { previewRoomPreferenceForAthlete, upsertRoomPreferenceForAthlete } from "@/lib/meet-room-mutations"

export type ParsedRoomImportRow = {
  rowNumber: number
  rawName: string
  rawEmail: string
  timestamp: string
  rawPreferredNames: string[]
  rawExcludedNames: string[]
  answers: Record<string, string>
  notes: string
  warnings: string[]
}

export type RoomImportParseResult = {
  rows: ParsedRoomImportRow[]
  errors: Array<{ row: number; message: string }>
}

/** Parse a Google Form response sheet into roommate-preference rows. See parseSignupResponseRecords for the row-numbering contract. */
export function parseRoomResponseRecords(
  values: string[][],
  mapping: ColumnMapping,
  ctx: { questions: MeetSignupQuestion[] }
): RoomImportParseResult {
  const headers = values[0] ?? []
  const records = values.slice(1)

  const rows: ParsedRoomImportRow[] = []
  const errors: RoomImportParseResult["errors"] = []
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
    const rawPreferredNames = (mapped.get("preferredRoommates") ?? []).flatMap(splitMultiValueCell)
    const rawExcludedNames = (mapped.get("excludedRoommates") ?? []).flatMap(splitMultiValueCell)

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

    const notes = (mapped.get("notes") ?? []).join("\n\n").trim()

    const parsedRow: ParsedRoomImportRow = {
      rowNumber,
      rawName,
      rawEmail,
      timestamp,
      rawPreferredNames,
      rawExcludedNames,
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

export type RoomImportRowOutcome = {
  rowNumber: number
  athleteId: string | null
  outcome: "created" | "updated" | "skipped"
  warnings: string[]
}

/**
 * Apply (or, when `dryRun`, merely preview) parsed roommate-preference rows.
 * Preferred/excluded roommate names are resolved to athlete ids with the
 * same matcher used for the row's own athlete — an unmatched name becomes a
 * row warning rather than a hard failure.
 */
export async function runRoomResponseImport(
  meetId: string,
  rows: ParsedRoomImportRow[],
  matches: Map<number, ImportRowMatch>,
  rosterCtx: FormImportRosterContext,
  opts: { dryRun: boolean }
): Promise<{ created: number; updated: number; skipped: number; rowOutcomes: RoomImportRowOutcome[] }> {
  const form = await prisma.meetRoomForm.findUnique({ where: { meetId }, select: { id: true } })
  if (!form) throw new Error("Roommate preference form not set up for this meet")

  const athleteIds = rows
    .map((r) => matches.get(r.rowNumber)?.athleteId)
    .filter((id): id is string => !!id)
  const existingEntries = athleteIds.length
    ? await prisma.meetRoomPreference.findMany({
        where: { formId: form.id, athleteId: { in: athleteIds } },
        select: { athleteId: true },
      })
    : []
  const existingSet = new Set(existingEntries.map((e) => e.athleteId))

  let created = 0
  let updated = 0
  let skipped = 0
  const rowOutcomes: RoomImportRowOutcome[] = []

  for (const row of rows) {
    const athleteId = matches.get(row.rowNumber)?.athleteId ?? null
    if (!athleteId) {
      skipped++
      rowOutcomes.push({ rowNumber: row.rowNumber, athleteId: null, outcome: "skipped", warnings: row.warnings })
      continue
    }

    const warnings = [...row.warnings]
    const resolveNames = (names: string[]) => {
      const ids: string[] = []
      for (const name of names) {
        const id = matchAthleteIdFast(name, rosterCtx.lookup)
        if (!id) {
          warnings.push(`Could not match roommate "${name}" — skipped`)
        } else if (id !== athleteId && !ids.includes(id)) {
          ids.push(id)
        }
      }
      return ids
    }
    const preferredAthleteIds = resolveNames(row.rawPreferredNames)
    const excludedAthleteIds = resolveNames(row.rawExcludedNames)

    const willCreate = !existingSet.has(athleteId)
    const data = { preferredAthleteIds, excludedAthleteIds, notes: row.notes, answers: row.answers }

    if (opts.dryRun) {
      const preview = await previewRoomPreferenceForAthlete(form.id, athleteId, data)
      warnings.push(...preview.warnings)
    } else {
      const result = await upsertRoomPreferenceForAthlete(form.id, athleteId, data)
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

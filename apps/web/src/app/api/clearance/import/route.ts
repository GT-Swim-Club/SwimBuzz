import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { readSheetImportSource } from "@/lib/meet/sheet-import-source"
import { collectNameConfirmations } from "@/lib/meet/meet-import"
import {
  buildAthleteLookup,
  normalizeNameMappings,
  normalizeRejectedNames,
} from "@/lib/athlete/athlete-match"
import { missingClearanceByAthlete, upsertClearanceQuery } from "@/lib/athlete/athlete-clearance"
import {
  clearanceColumnsProblem,
  detectClearanceColumns,
  findClearanceHeaderRow,
  nonEmptyRecords,
  normalizeClearanceColumns,
  parseClearanceRows,
  resolveClearanceImport,
  type ClearanceRosterAthlete,
} from "@/lib/athlete/clearance-import"
import { parseSeason } from "@/lib/season"

export const runtime = "nodejs"

/**
 * Import physical & concussion clearance for `?season=` from a Google Sheet or CSV.
 * 1. No `fields.columns`: returns the detected header row and column mapping for staff to confirm.
 * 2. With the confirmed `fields.columns` (+ `fields.headerRow`): matches rows by GTID, email,
 *    then name. When names need pairing nothing is saved until the re-run with `paired: true`.
 * Only status and dates are stored; every other column is ignored.
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const season = parseSeason(new URL(req.url).searchParams.get("season"))
  if (!season) return NextResponse.json({ error: "Invalid season" }, { status: 400 })

  const source = await readSheetImportSource(req)
  if ("error" in source) return NextResponse.json({ error: source.error }, { status: source.status })

  // Keep blank rows so row numbers match the sheet; only the emptiness check skips them.
  const records = source.values
  if (nonEmptyRecords(records).length < 2) {
    return NextResponse.json({ error: "The sheet has no rows to import" }, { status: 400 })
  }

  const fields = (source.fields && typeof source.fields === "object" ? source.fields : {}) as Record<string, unknown>
  const width = records.reduce((max, r) => Math.max(max, r.length), 0)

  if (fields.columns == null) {
    const headerRow = findClearanceHeaderRow(records)
    return NextResponse.json({
      step: "mapping",
      headerRow,
      headers: Array.from({ length: width }, (_, i) => (records[headerRow]?.[i] ?? "").trim()),
      detected: detectClearanceColumns(records[headerRow] ?? []),
      sample: nonEmptyRecords(records.slice(headerRow + 1)).slice(0, 3),
      rowCount: nonEmptyRecords(records.slice(headerRow + 1)).length,
    })
  }

  const headerRow =
    typeof fields.headerRow === "number" && Number.isInteger(fields.headerRow) && fields.headerRow >= 0
      ? Math.min(fields.headerRow, records.length - 1)
      : findClearanceHeaderRow(records)
  const columns = normalizeClearanceColumns(fields.columns, width)
  const problem = columns ? clearanceColumnsProblem(columns) : "Invalid column mapping"
  if (!columns || problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { rows, warnings } = parseClearanceRows(records, headerRow, columns)
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows with a GTID, email or name under the header" }, { status: 400 })
  }

  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      gtid: true,
      user: { select: { email: true } },
    },
  })
  const roster: ClearanceRosterAthlete[] = athletes.map((a) => ({
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    preferredName: a.preferredName,
    gtid: a.gtid,
    email: a.user?.email ?? null,
  }))

  const nameMappings = normalizeNameMappings(source.nameMappings)
  const rejectedNames = normalizeRejectedNames(source.rejectedNames)
  const resolved = resolveClearanceImport(rows, roster, nameMappings, rejectedNames)

  const nameConfirmations = collectNameConfirmations(
    resolved.unmatchedNames,
    roster,
    buildAthleteLookup(roster),
    nameMappings,
    rejectedNames
  )
  if (nameConfirmations.length > 0 && !source.paired) {
    return NextResponse.json({
      pending: true,
      nameConfirmations,
      rosterForPairing: roster
        .map((a) => ({ id: a.id, firstName: a.firstName, lastName: a.lastName }))
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    })
  }

  if (req.signal.aborted) return new NextResponse(null, { status: 499 })
  const updates = [...resolved.updates.entries()]
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map(([athleteId, update]) => upsertClearanceQuery(athleteId, season, update, "IMPORT"))
    )
  }

  const missing = await missingClearanceByAthlete(season, roster.map((a) => a.id))
  return NextResponse.json({
    season,
    imported: updates.length,
    noData: resolved.noData,
    unmatched: resolved.unmatchedRows,
    uncleared: [...missing.values()].filter((m) => m.length > 0).length,
    rosterSize: roster.length,
    warnings,
  })
}

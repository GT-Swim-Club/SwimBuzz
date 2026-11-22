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
import { upsertClearanceQuery } from "@/lib/athlete/athlete-clearance"
import {
  clearanceImportHeaderError,
  findClearanceImportHeader,
  parseClearanceImportKind,
  parseClearanceImportRows,
  resolveClearanceImport,
  type ClearanceRosterAthlete,
} from "@/lib/athlete/clearance-import"
import { parseSeason } from "@/lib/season"

export const runtime = "nodejs"

/**
 * Import one clearance check for the `?season=` roster from a CSV (`?kind=`):
 * - `physical` (default): Ideal Logic's medical clearance CSV (the "Incomplete" members list).
 *   Listed members are incomplete; everyone else on the roster is complete.
 * - `concussion`: the SWAY tracker. "Complete" is done; anything else, or not listed, isn't.
 * Names are matched to the roster; when some need pairing nothing is saved until the re-run with
 * `paired: true`. The SWAY tracker covers the whole club, so only names with a likely roster match
 * are offered for pairing there. Clearance itself is one-and-done, not per season.
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const params = new URL(req.url).searchParams
  const season = parseSeason(params.get("season"))
  if (!season) return NextResponse.json({ error: "Invalid season" }, { status: 400 })
  const kind = parseClearanceImportKind(params.get("kind"))
  if (!kind) return NextResponse.json({ error: "Invalid import kind" }, { status: 400 })

  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    return NextResponse.json({ error: "Upload a CSV file" }, { status: 400 })
  }
  const source = await readSheetImportSource(req)
  if ("error" in source) return NextResponse.json({ error: source.error }, { status: source.status })

  const header = findClearanceImportHeader(kind, source.values)
  if (!header) return NextResponse.json({ error: clearanceImportHeaderError(kind) }, { status: 400 })
  const { rows, warnings } = parseClearanceImportRows(kind, source.values, header.headerRow, header.columns)

  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      clearance: { select: { physicalCleared: true, concussionCleared: true } },
    },
  })
  if (athletes.length === 0) {
    return NextResponse.json({ error: "No athletes are on this season's roster" }, { status: 400 })
  }
  const roster: ClearanceRosterAthlete[] = athletes.map((a) => ({
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    preferredName: a.preferredName,
  }))

  const nameMappings = normalizeNameMappings(source.nameMappings)
  const rejectedNames = normalizeRejectedNames(source.rejectedNames)
  const resolved = resolveClearanceImport(kind, rows, roster, nameMappings, rejectedNames)

  const allConfirmations = collectNameConfirmations(
    resolved.unmatchedNames,
    roster,
    buildAthleteLookup(roster),
    nameMappings,
    rejectedNames
  )
  const nameConfirmations =
    kind === "concussion" ? allConfirmations.filter((c) => c.athleteId) : allConfirmations
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
  // Only write athletes whose check changes (no record = incomplete).
  const current = new Map(
    athletes.map((a) => [
      a.id,
      kind === "physical" ? (a.clearance?.physicalCleared ?? false) : (a.clearance?.concussionCleared ?? false),
    ])
  )
  const changes = [...resolved.updates.entries()].filter(
    ([athleteId, update]) => update[kind] && update[kind].cleared !== current.get(athleteId)
  )
  if (changes.length > 0) {
    await prisma.$transaction(changes.map(([athleteId, update]) => upsertClearanceQuery(athleteId, update, "IMPORT")))
  }

  return NextResponse.json({
    season,
    kind,
    changed: changes.length,
    incomplete: resolved.incomplete,
    complete: resolved.complete,
    unmatched: resolved.unmatchedRows,
    rosterSize: roster.length,
    warnings,
  })
}

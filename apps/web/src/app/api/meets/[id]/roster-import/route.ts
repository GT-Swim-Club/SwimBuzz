import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { Gender, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { readSheetImportSource } from "@/lib/meet/sheet-import-source"
import {
  buildAthleteLookup,
  normalizeNameMappings,
  normalizeRejectedNames,
} from "@/lib/athlete/athlete-match"
import { collectNameConfirmations } from "@/lib/meet/meet-import"
import {
  applyMeetRosterToEntriesSummary,
  buildMeetFinalRoster,
  isMeetFinalRoster,
  parseMeetRosterRecords,
  removeMeetRosterFromEntriesSummary,
  resolveMeetRosterImport,
  type MeetRosterAthlete,
} from "@/lib/meet/meet-roster-import"
import {
  isResultStatusesSummary,
  isSheetSummary,
  meetHasImportedResults,
} from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"

export const runtime = "nodejs"

function revalidateMeet() {
  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/relays", "page")
}

/**
 * Import the final meet roster (Google Sheet or CSV). Replaces the previous
 * roster; seeds for anyone not on it leave the roster summary (kept on the
 * roster so clearing it brings them back). When names need
 * pairing, nothing is saved until the re-run with `paired: true` and the
 * coach's `nameMappings`/`rejectedNames`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      course: true,
      season: true,
      entriesSheetSummary: true,
      finalRoster: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      _count: { select: { swims: true } },
    },
  })
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })

  if (
    meetHasImportedResults({
      swimCount: meet._count.swims,
      resultStatusEntries: isResultStatusesSummary(meet.resultStatusesSummary)
        ? meet.resultStatusesSummary.entries
        : null,
      relayResults: isRelayResultsSummary(meet.relayResultsSummary)
        ? meet.relayResultsSummary.entries
        : null,
    })
  ) {
    return NextResponse.json(
      { error: "The roster can't be imported after results have been imported." },
      { status: 409 }
    )
  }

  const source = await readSheetImportSource(req)
  if ("error" in source) {
    return NextResponse.json({ error: source.error }, { status: source.status })
  }

  const parsed = parseMeetRosterRecords(source.values)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const roster: MeetRosterAthlete[] = athletes.map((a) => ({
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    preferredName: a.preferredName,
    gender: a.gender === Gender.F ? "F" : "M",
  }))

  const nameMappings = normalizeNameMappings(source.nameMappings)
  const rejectedNames = normalizeRejectedNames(source.rejectedNames)
  const resolved = resolveMeetRosterImport(parsed.rows, roster, nameMappings, rejectedNames)

  const nameConfirmations = collectNameConfirmations(
    resolved.unmatchedNames,
    roster,
    buildAthleteLookup(roster),
    nameMappings,
    rejectedNames
  )
  const rosterForPairing =
    nameConfirmations.length > 0
      ? roster
          .map((a) => ({ id: a.id, firstName: a.firstName, lastName: a.lastName }))
          .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
      : []

  // Saving now would drop unpaired athletes' sign-up rows before the coach pairs
  // them, so wait for the re-run (paired or skipped) when names need pairing.
  if (nameConfirmations.length > 0 && !source.paired) {
    return NextResponse.json({ pending: true, nameConfirmations, rosterForPairing })
  }

  // Start from the summary without the previous roster, so replacing it matches a fresh import.
  const existing = removeMeetRosterFromEntriesSummary(
    isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null,
    meet.course,
    isMeetFinalRoster(meet.finalRoster) ? meet.finalRoster : null
  )
  const { summary, removedEntries, removedAthletes, attendingAdded } = applyMeetRosterToEntriesSummary(
    existing,
    meet.course,
    resolved.athletes.map((a) => ({
      athleteId: a.id,
      athleteName: `${a.lastName}, ${a.firstName}`,
      gender: a.gender,
    }))
  )

  if (req.signal.aborted) return new NextResponse(null, { status: 499 })
  await prisma.meet.update({
    where: { id: meetId },
    data: {
      entriesSheetSummary: summary as Prisma.InputJsonValue,
      finalRoster: buildMeetFinalRoster(
        resolved.athletes.map((a) => a.id),
        removedEntries
      ) as Prisma.InputJsonValue,
    },
  })
  revalidateMeet()

  return NextResponse.json({
    imported: resolved.athletes.length,
    removed: removedAthletes,
    attendingAdded,
    skipped: resolved.unmatchedNames.length + resolved.rejected,
    warnings: resolved.warnings,
  })
}

/** Clear the final roster: restore the sign-ups/seeds it removed and drop its "Attending" rows. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { course: true, entriesSheetSummary: true, finalRoster: true },
  })
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const finalRoster = isMeetFinalRoster(meet.finalRoster) ? meet.finalRoster : null
  await prisma.meet.update({
    where: { id: meetId },
    data: {
      finalRoster: Prisma.DbNull,
      ...(existing || finalRoster
        ? {
            entriesSheetSummary: removeMeetRosterFromEntriesSummary(
              existing,
              meet.course,
              finalRoster
            ) as Prisma.InputJsonValue,
          }
        : {}),
    },
  })
  revalidateMeet()
  return NextResponse.json({ ok: true })
}

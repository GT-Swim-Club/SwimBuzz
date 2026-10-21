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
import { resolveSignupEventOptions } from "@/lib/meet/meet-signup"
import {
  applySignupImportToEntriesSummary,
  buildSignupRelayPreferences,
  parseSignupRecords,
  resolveSignupImport,
  type SignupRosterAthlete,
} from "@/lib/meet/meet-signup-import"
import {
  applyMeetRosterToEntriesSummary,
  isMeetFinalRoster,
  type MeetFinalRoster,
} from "@/lib/meet/meet-roster-import"
import {
  isResultStatusesSummary,
  isSheetSummary,
  meetHasImportedResults,
} from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"

export const runtime = "nodejs"

/**
 * Import meet sign-ups (form responses) into the roster summary. Replaces the
 * previous sign-up import; re-run with `nameMappings`/`rejectedNames` after the
 * coach pairs unmatched names.
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
      eventOrder: true,
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
      { error: "Sign-ups can't be imported after results have been imported." },
      { status: 409 }
    )
  }

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  if (eventOptions.length === 0) {
    return NextResponse.json(
      { error: "Add the meet packet first so event numbers can be matched." },
      { status: 400 }
    )
  }

  const source = await readSheetImportSource(req)
  if ("error" in source) {
    return NextResponse.json({ error: source.error }, { status: source.status })
  }

  const parsed = parseSignupRecords(source.values)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      gender: true,
      user: { select: { email: true } },
    },
  })
  const roster: SignupRosterAthlete[] = athletes.map((a) => ({
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    preferredName: a.preferredName,
    gender: a.gender === Gender.F ? "F" : "M",
    email: a.user.email,
  }))

  const nameMappings = normalizeNameMappings(source.nameMappings)
  const rejectedNames = normalizeRejectedNames(source.rejectedNames)
  const resolved = resolveSignupImport(parsed.rows, roster, eventOptions, nameMappings, rejectedNames)

  // With a final roster imported, only roster athletes' sign-ups reach the summary.
  // Relay preferences keep every sign-up; the relay builder filters by roster itself.
  const finalRoster = isMeetFinalRoster(meet.finalRoster) ? meet.finalRoster : null
  const onRoster = finalRoster ? new Set(finalRoster.athleteIds) : null
  const rosterSignups = onRoster
    ? resolved.signups.filter((s) => onRoster.has(s.athleteId))
    : resolved.signups

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const applied = applySignupImportToEntriesSummary(existing, meet.course, rosterSignups)
  const { entries, attendingOnly } = applied
  let summary = applied.summary
  let nextFinalRoster: MeetFinalRoster | null = null
  if (finalRoster && onRoster) {
    const rostered = applyMeetRosterToEntriesSummary(
      applied.summary,
      meet.course,
      roster
        .filter((a) => onRoster.has(a.id))
        .map((a) => ({ athleteId: a.id, athleteName: `${a.lastName}, ${a.firstName}`, gender: a.gender }))
    )
    summary = rostered.summary
    // Off-roster sign-ups replace the roster's held-back ones, ready for when it's cleared.
    const heldBack = applySignupImportToEntriesSummary(
      { sheetType: summary.sheetType, course: summary.course, entries: finalRoster.removedEntries ?? [] },
      meet.course,
      resolved.signups.filter((s) => !onRoster.has(s.athleteId))
    ).summary.entries
    nextFinalRoster = { ...finalRoster, removedEntries: [...heldBack, ...rostered.removedEntries] }
  }

  await prisma.meet.update({
    where: { id: meetId },
    data: {
      entriesSheetSummary: summary as Prisma.InputJsonValue,
      ...(nextFinalRoster ? { finalRoster: nextFinalRoster as Prisma.InputJsonValue } : {}),
      signupRelayPreferences: buildSignupRelayPreferences(resolved.signups) as Prisma.InputJsonValue,
    },
  })
  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/relays", "page")

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

  return NextResponse.json({
    imported: resolved.signups.length,
    entries,
    attendingOnly,
    skipped: resolved.unmatchedNames.length + resolved.rejected,
    notOnRoster: resolved.signups.length - rosterSignups.length,
    warnings: resolved.warnings,
    nameConfirmations,
    rosterForPairing,
  })
}

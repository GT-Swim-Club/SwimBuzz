"use server"

import { revalidatePath } from "next/cache"
import { Gender } from "@prisma/client"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import {
  isValidSignupEntryTime,
  normalizeSignupEntryTime,
  resolveSignupEventOptions,
  createManualIndividualSheetEntry } from "@/lib/meet/meet-signup"
import { isSheetSummary, isResultStatusesSummary, meetHasImportedResults } from "@/lib/meet/meet-sheet-summary"
import {
  isRelayResultsSummary,
  parseRelayGender,
  removeRelayTeamEntries,
  upsertRelayTeamEntries,
  findRelayTeamEntry,
  relayTeamTime,
  relayTeamPlace,
  effectiveRelayRound,
  effectiveRelayGender,
  sanitizeRelayLegSplits,
  sanitizeRelaySplitTime,
  type RelayGender,
  type RelayRound,
  type RelayTeamInput } from "@/lib/meet/relay-results"
import { syncRelayLeadoffSwim, deleteRelayLeadoffSwim } from "@/lib/meet/relay-leadoff-sync"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

async function requireStaff() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }
}

export type AddIndividualSheetEntryInput = {
  athleteId: string
  event: string
  seedTime: string
}

/** Same logic as the non-rosterOnly branch of POST /api/meets/[id]/sheet-entry. */
export async function addIndividualSheetEntry(meetId: string, input: AddIndividualSheetEntryInput) {
  await requireStaff()

  const athleteId = input.athleteId.trim()
  const event = input.event.trim()
  if (!athleteId || !event) throw new Error("athleteId and event are required")

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { course: true, eventOrder: true, entriesSheetSummary: true }})
  if (!meet) throw new Error("Meet not found")

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  const eventNorm = normalizeEventName(event)
  if (
    eventOptions.length > 0 &&
    !eventOptions.some((o) => normalizeEventName(o.event) === eventNorm)
  ) {
    throw new Error("Invalid event")
  }

  const seedTimeRaw = input.seedTime.trim() || "NT"
  const seedNormalized = normalizeSignupEntryTime(seedTimeRaw)
  if (!/^nt$/i.test(seedNormalized) && !isValidSignupEntryTime(seedNormalized)) {
    throw new Error("Enter a valid seed time (e.g. 58.32 or 1:02.15) or NT")
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, firstName: true, lastName: true, gender: true }})
  if (!athlete) throw new Error("Athlete not found")

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null

  const { summary, conflict } = createManualIndividualSheetEntry(existing, meet.course, {
    athleteId,
    athleteName: `${athlete.lastName}, ${athlete.firstName}`,
    event,
    gender: athlete.gender === "F" ? "F" : athlete.gender === "M" ? "M" : null,
    seedTime: seedNormalized,
    eventOptions})

  if (conflict) throw new Error("Athlete already has that event on the roster summary.")

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue }})

  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}

export type UpsertRelayEntryInput = {
  event: string
  relayLetter?: string | null
  relayRound?: string
  gender: "F" | "M"
  legs: { leg: number; athleteId: string }[]
  resultTime?: string
  resultPlace?: number
  seedTime?: string
  rosterOnly?: boolean
}

function parseRelayInput(input: UpsertRelayEntryInput): RelayTeamInput | null {
  const event = normalizeEventName(input.event)
  if (!event) return null

  const legs = input.legs
    .map((leg) => {
      const athleteId = String(leg.athleteId ?? "").trim()
      const legNum = Number(leg.leg)
      if (!athleteId || !Number.isFinite(legNum)) return null
      return { leg: legNum, athleteId }
    })
    .filter((leg): leg is { leg: number; athleteId: string } => leg !== null)

  if (legs.length !== 4) return null
  const uniqueAthletes = new Set(legs.map((l) => l.athleteId))
  if (uniqueAthletes.size !== 4) return null

  const relayLetterRaw = String(input.relayLetter ?? "").trim().toUpperCase()
  const roundRaw = String(input.relayRound ?? "").trim().toUpperCase()
  const relayRound: RelayRound =
    roundRaw === "P" || roundRaw === "PRELIM" || roundRaw === "PRELIMS"
      ? "P"
      : roundRaw === "F" || roundRaw === "FINAL" || roundRaw === "FINALS"
        ? "F"
        : ""

  const resultPlace =
    input.resultPlace != null && Number.isFinite(input.resultPlace) && input.resultPlace > 0
      ? input.resultPlace
      : undefined

  return {
    event,
    relayLetter: relayLetterRaw || null,
    relayRound,
    gender: parseRelayGender(input.gender) || "F",
    legs,
    resultTime: String(input.resultTime ?? "").trim() || undefined,
    resultPlace,
    seedTime: String(input.seedTime ?? "").trim() || undefined}
}

/** Same logic as POST /api/meets/[id]/relays. */
export async function upsertRelayEntry(meetId: string, input: UpsertRelayEntryInput) {
  await requireStaff()

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    include: { _count: { select: { swims: true } } }})
  if (!meet) throw new Error("Not found")

  const relay = parseRelayInput(input)
  if (!relay) throw new Error("Event and four unique relay legs are required")

  const rosterOnly = input.rosterOnly === true

  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: { id: true, firstName: true, lastName: true, nicknames: true, gender: true }})

  const athleteGenders = new Map<string, RelayGender>(
    roster.map((a) => [a.id, a.gender === Gender.F ? "F" : "M"])
  )

  for (const leg of relay.legs) {
    if (!roster.some((a) => a.id === leg.athleteId)) {
      throw new Error("All relay swimmers must be on the meet season roster")
    }
  }

  const existing = isRelayResultsSummary(meet.relayResultsSummary)
    ? meet.relayResultsSummary.entries
    : []

  const existingEntry = findRelayTeamEntry(
    existing,
    relay.event,
    relay.relayLetter,
    relay.relayRound ?? "",
    relay.gender ?? "",
    athleteGenders
  )
  const priorLeg1AthleteId = existingEntry?.relaySwimmers?.find((s) => s.leg === 1)?.athleteId

  let relayToSave: RelayTeamInput = { ...relay, manual: true }

  if (rosterOnly) {
    if (!existingEntry) throw new Error("Relay not found")
    if (existingEntry.manual) throw new Error("Use full edit for manually added relays")
    relayToSave = {
      event: existingEntry.event,
      relayLetter: existingEntry.relayLetter,
      relayRound: effectiveRelayRound(existingEntry),
      gender: effectiveRelayGender(existingEntry, athleteGenders),
      resultTime: relayTeamTime(existingEntry),
      resultPlace: relayTeamPlace(existingEntry),
      seedTime: existingEntry.seedTime,
      legs: relay.legs.map((leg) => {
        const prev = existingEntry.relaySwimmers?.find((s) => s.leg === leg.leg)
        const splits = sanitizeRelayLegSplits(prev?.splits)
        return {
          ...leg,
          splitTime: sanitizeRelaySplitTime(prev?.splitTime),
          ...(splits ? { splits } : {})}
      }),
      manual: false}
  } else if (
    !relay.resultTime &&
    meetHasImportedResults({
      swimCount: meet._count.swims,
      resultStatusEntries: isResultStatusesSummary(meet.resultStatusesSummary)
        ? meet.resultStatusesSummary.entries
        : null,
      relayResults: existing}) &&
    (!existingEntry || !existingEntry.manual)
  ) {
    throw new Error("Cannot add relay seeds to the roster summary after results have been imported.")
  }

  if (existingEntry && !rosterOnly) {
    relayToSave = {
      ...relayToSave,
      legs: relayToSave.legs.map((leg) => {
        if (leg.splits?.length) return leg
        const prev = existingEntry.relaySwimmers?.find((s) => s.leg === leg.leg)
        const prevSplits = sanitizeRelayLegSplits(prev?.splits)
        if (!prevSplits?.length) return leg
        const prevTotal = sanitizeRelaySplitTime(prev?.splitTime)
        const nextTotal = sanitizeRelaySplitTime(leg.splitTime)
        if (!prevTotal || !nextTotal || prevTotal !== nextTotal) return leg
        return { ...leg, splits: prevSplits }
      })}
  }

  const entries = upsertRelayTeamEntries(existing, relayToSave, roster, athleteGenders)

  await prisma.meet.update({
    where: { id: meetId },
    data: { relayResultsSummary: { entries } }})

  const leg1 = relayToSave.legs.find((leg) => leg.leg === 1)
  if (priorLeg1AthleteId && priorLeg1AthleteId !== leg1?.athleteId) {
    await deleteRelayLeadoffSwim(meet, relayToSave.event, priorLeg1AthleteId, relayToSave.relayRound ?? "")
  }
  if (leg1 && (leg1.splitTime || rosterOnly || Boolean(relay.resultTime))) {
    await syncRelayLeadoffSwim(
      meet,
      relayToSave.event,
      leg1.athleteId,
      leg1.splitTime,
      "relay",
      undefined,
      relayToSave.relayRound ?? ""
    )
  }

  revalidatePath("/meets/[id]", "page")
  return { ok: true, entries: entries.length }
}

/** Same logic as DELETE /api/meets/[id]/relays (not currently used by any of
 * this batch's buttons, kept for parity with the route so future callers can
 * reuse it instead of re-deriving the leadoff/manual-guard logic). */
export async function removeRelayEntry(
  meetId: string,
  params: { event: string; relayLetter?: string | null; relayRound?: string; gender?: string | null }
) {
  await requireStaff()

  const meet = await prisma.meet.findUnique({ where: { id: meetId } })
  if (!meet) throw new Error("Not found")

  const event = normalizeEventName(params.event)
  const relayLetter = params.relayLetter?.trim().toUpperCase() || null
  const roundRaw = params.relayRound?.trim().toUpperCase() ?? ""
  const relayRound: RelayRound = roundRaw === "P" ? "P" : roundRaw === "F" ? "F" : ""
  const gender = parseRelayGender(params.gender)

  if (!event) throw new Error("Event is required")

  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: { id: true, gender: true }})
  const athleteGenders = new Map<string, RelayGender>(
    roster.map((a) => [a.id, a.gender === Gender.F ? "F" : "M"])
  )

  const existing = isRelayResultsSummary(meet.relayResultsSummary) ? meet.relayResultsSummary.entries : []

  const sample = findRelayTeamEntry(existing, event, relayLetter, relayRound, gender, athleteGenders)
  if (sample && !sample.manual) throw new Error("Imported relays cannot be deleted")

  const leg1AthleteId = sample?.relaySwimmers?.find((s) => s.leg === 1)?.athleteId
  if (leg1AthleteId) {
    await deleteRelayLeadoffSwim(meet, event, leg1AthleteId, relayRound)
  }

  const entries = removeRelayTeamEntries(existing, event, relayLetter, relayRound, gender, athleteGenders)

  await prisma.meet.update({
    where: { id: meetId },
    data: { relayResultsSummary: { entries } }})

  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}

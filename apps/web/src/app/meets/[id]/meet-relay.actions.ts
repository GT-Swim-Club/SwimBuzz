"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import {
  isRelayResultsSummary,
  parseRelayGender,
  relayTeamKey,
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
import {
  isResultStatusesSummary,
  meetHasImportedResults } from "@/lib/meet/meet-sheet-summary"
import { Gender } from "@prisma/client"
import { syncRelayLeadoffSwim, deleteRelayLeadoffSwim } from "@/lib/meet/relay-leadoff-sync"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

/** Shared with POST/DELETE /api/meets/[id]/relays — same logic, kept in sync
 * manually since the route can't be refactored without risking the
 * mobile-facing contract. */

export type RelayLegInput = {
  leg: number
  athleteId: string
  splitTime?: string
  splits?: { distance: number; splitTime: string }[]
}

export type SaveRelayInput = {
  event: string
  relayLetter?: string | null
  relayRound?: RelayRound
  gender?: RelayGender
  legs: RelayLegInput[]
  resultTime?: string
  resultPlace?: number
  seedTime?: string
  rosterOnly?: boolean
}

function normalizeRelayInput(input: SaveRelayInput): RelayTeamInput | null {
  const event = normalizeEventName(input.event)
  if (!event) return null

  const legs = input.legs
    .map((leg) => {
      const athleteId = String(leg.athleteId ?? "").trim()
      const legNum = leg.leg
      if (!athleteId || !Number.isFinite(legNum)) return null
      const splitTime = String(leg.splitTime ?? "").trim() || undefined
      const splits = leg.splits?.filter(
        (s) => Number.isFinite(s.distance) && s.distance > 0 && s.splitTime
      )
      return {
        leg: legNum,
        athleteId,
        ...(splitTime ? { splitTime } : {}),
        ...(splits?.length ? { splits } : {})}
    })
    .filter((leg): leg is NonNullable<typeof leg> => leg !== null)

  if (legs.length !== 4) return null
  if (new Set(legs.map((l) => l.athleteId)).size !== 4) return null

  const relayLetterRaw = (input.relayLetter ?? "").trim().toUpperCase()
  const roundRaw = (input.relayRound ?? "").trim().toUpperCase()
  const relayRound: RelayRound = roundRaw === "P" ? "P" : roundRaw === "F" ? "F" : ""

  return {
    event,
    relayLetter: relayLetterRaw || null,
    relayRound,
    gender: parseRelayGender(input.gender) || "F",
    legs,
    resultTime: (input.resultTime ?? "").trim() || undefined,
    resultPlace:
      input.resultPlace != null && Number.isFinite(input.resultPlace) && input.resultPlace > 0
        ? input.resultPlace
        : undefined,
    seedTime: (input.seedTime ?? "").trim() || undefined}
}

async function requireStaffMeet(meetId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    include: { _count: { select: { swims: true } } }})
  if (!meet) throw new Error("Not found")
  return meet
}

export async function saveRelayTeam(meetId: string, input: SaveRelayInput) {
  const meet = await requireStaffMeet(meetId)

  const relay = normalizeRelayInput(input)
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
    throw new Error(
      "Cannot add relay seeds to the roster summary after results have been imported."
    )
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

export async function deleteRelayTeam(
  meetId: string,
  params: { event: string; relayLetter: string | null; relayRound: RelayRound; gender: RelayGender }
) {
  const meet = await requireStaffMeet(meetId)

  const event = normalizeEventName(params.event)
  if (!event) throw new Error("Event is required")

  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: { id: true, gender: true }})
  const athleteGenders = new Map<string, RelayGender>(
    roster.map((a) => [a.id, a.gender === Gender.F ? "F" : "M"])
  )

  const existing = isRelayResultsSummary(meet.relayResultsSummary)
    ? meet.relayResultsSummary.entries
    : []

  const sample = findRelayTeamEntry(
    existing,
    event,
    params.relayLetter,
    params.relayRound,
    params.gender,
    athleteGenders
  )
  if (sample && !sample.manual) {
    throw new Error("Imported relays cannot be deleted")
  }

  const leg1AthleteId = sample?.relaySwimmers?.find((s) => s.leg === 1)?.athleteId
  if (leg1AthleteId) {
    await deleteRelayLeadoffSwim(meet, event, leg1AthleteId, params.relayRound)
  }

  const entries = removeRelayTeamEntries(
    existing,
    event,
    params.relayLetter,
    params.relayRound,
    params.gender,
    athleteGenders
  )

  await prisma.meet.update({
    where: { id: meetId },
    data: { relayResultsSummary: { entries } }})

  revalidatePath("/meets/[id]", "page")
  return { ok: true, removed: relayTeamKey(event, params.relayLetter, params.relayRound, params.gender) }
}

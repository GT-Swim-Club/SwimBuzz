import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { normalizeEventName } from "@/lib/swim-parse"
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
  type RelayGender,
  type RelayRound,
  type RelayTeamInput,
} from "@/lib/relay-results"
import {
  isResultStatusesSummary,
  meetHasImportedResults,
} from "@/lib/meet-sheet-summary"
import { Gender } from "@prisma/client"
import { syncRelayLeadoffSwim, deleteRelayLeadoffSwim } from "@/lib/relay-leadoff-sync"

export const runtime = "nodejs"

function parseRelayBody(body: unknown): RelayTeamInput | null {
  if (!body || typeof body !== "object") return null
  const raw = body as Record<string, unknown>
  const event = normalizeEventName(String(raw.event ?? ""))
  if (!event) return null

  const legsRaw = Array.isArray(raw.legs) ? raw.legs : []
  const legs = legsRaw
    .map((leg) => {
      if (!leg || typeof leg !== "object") return null
      const l = leg as Record<string, unknown>
      const athleteId = String(l.athleteId ?? "").trim()
      const legNum = parseInt(String(l.leg ?? ""), 10)
      if (!athleteId || !Number.isFinite(legNum)) return null
      const splitTime = String(l.splitTime ?? "").trim() || undefined
      return {
        leg: legNum,
        athleteId,
        ...(splitTime ? { splitTime } : {}),
      }
    })
    .filter((leg): leg is NonNullable<typeof leg> => leg !== null)

  if (legs.length !== 4) return null

  const uniqueAthletes = new Set(legs.map((l) => l.athleteId))
  if (uniqueAthletes.size !== 4) return null

  const parseOptionalInt = (v: unknown) => {
    if (v == null || v === "") return undefined
    const n = parseInt(String(v), 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  const relayLetterRaw = String(raw.relayLetter ?? "").trim().toUpperCase()
  const roundRaw = String(raw.relayRound ?? raw.round ?? "").trim().toUpperCase()
  const relayRound: RelayRound =
    roundRaw === "P" || roundRaw === "PRELIM" || roundRaw === "PRELIMS"
      ? "P"
      : roundRaw === "F" || roundRaw === "FINAL" || roundRaw === "FINALS"
        ? "F"
        : ""

  return {
    event,
    relayLetter: relayLetterRaw || null,
    relayRound,
    gender: parseRelayGender(raw.gender) || "F",
    legs,
    resultTime: String(raw.resultTime ?? "").trim() || undefined,
    resultPlace: parseOptionalInt(raw.resultPlace),
    seedTime: String(raw.seedTime ?? "").trim() || undefined,
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const meet = await prisma.meet.findUnique({
    where: { id },
    include: { _count: { select: { swims: true } } },
  })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const relay = parseRelayBody(body)
  if (!relay) {
    return NextResponse.json(
      { error: "Event and four unique relay legs are required" },
      { status: 400 }
    )
  }

  const rosterOnly = (body as { rosterOnly?: boolean }).rosterOnly === true

  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: { id: true, firstName: true, lastName: true, nicknames: true, gender: true },
  })

  const athleteGenders = new Map<string, RelayGender>(
    roster.map((a) => [a.id, a.gender === Gender.F ? "F" : "M"])
  )

  for (const leg of relay.legs) {
    if (!roster.some((a) => a.id === leg.athleteId)) {
      return NextResponse.json(
        { error: "All relay swimmers must be on the meet season roster" },
        { status: 400 }
      )
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
  const priorLeg1AthleteId = existingEntry?.relaySwimmers?.find((s) => s.leg === 1)
    ?.athleteId

  let relayToSave: RelayTeamInput = { ...relay, manual: true }

  if (rosterOnly) {
    if (!existingEntry) {
      return NextResponse.json({ error: "Relay not found" }, { status: 404 })
    }
    if (existingEntry.manual) {
      return NextResponse.json(
        { error: "Use full edit for manually added relays" },
        { status: 400 }
      )
    }
    relayToSave = {
      event: existingEntry.event,
      relayLetter: existingEntry.relayLetter,
      relayRound: effectiveRelayRound(existingEntry),
      gender: effectiveRelayGender(existingEntry, athleteGenders),
      resultTime: relayTeamTime(existingEntry),
      resultPlace: relayTeamPlace(existingEntry),
      seedTime: existingEntry.seedTime,
      legs: relay.legs,
      manual: false,
    }
  } else if (
    !relay.resultTime &&
    meetHasImportedResults({
      swimCount: meet._count.swims,
      resultStatusEntries: isResultStatusesSummary(meet.resultStatusesSummary)
        ? meet.resultStatusesSummary.entries
        : null,
      relayResults: existing,
    }) &&
    // Allow editing leftover manual seeds; block new seed-only creates and
    // overwriting imported relays from the relay builder.
    (!existingEntry || !existingEntry.manual)
  ) {
    return NextResponse.json(
      {
        error:
          "Cannot add relay seeds to the roster summary after results have been imported.",
      },
      { status: 409 }
    )
  }

  const entries = upsertRelayTeamEntries(existing, relayToSave, roster, athleteGenders)

  await prisma.meet.update({
    where: { id },
    data: { relayResultsSummary: { entries } },
  })

  const leg1 = relayToSave.legs.find((leg) => leg.leg === 1)
  if (priorLeg1AthleteId && priorLeg1AthleteId !== leg1?.athleteId) {
    await deleteRelayLeadoffSwim(
      meet,
      relayToSave.event,
      priorLeg1AthleteId,
      relayToSave.relayRound ?? ""
    )
  }
  // Seed-only saves (e.g. relay builder → roster) omit splits/result times — leave leadoff swims alone.
  if (
    leg1 &&
    (leg1.splitTime || rosterOnly || Boolean(relay.resultTime))
  ) {
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

  return NextResponse.json({ ok: true, entries: entries.length })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const meet = await prisma.meet.findUnique({ where: { id } })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const event = normalizeEventName(searchParams.get("event") ?? "")
  const relayLetter = searchParams.get("relayLetter")?.trim().toUpperCase() || null
  const roundRaw = searchParams.get("relayRound")?.trim().toUpperCase() ?? ""
  const relayRound: RelayRound =
    roundRaw === "P" ? "P" : roundRaw === "F" ? "F" : ""
  const gender = parseRelayGender(searchParams.get("gender"))

  if (!event) {
    return NextResponse.json({ error: "Event is required" }, { status: 400 })
  }

  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: { id: true, gender: true },
  })
  const athleteGenders = new Map<string, RelayGender>(
    roster.map((a) => [a.id, a.gender === Gender.F ? "F" : "M"])
  )

  const existing = isRelayResultsSummary(meet.relayResultsSummary)
    ? meet.relayResultsSummary.entries
    : []

  const sample = findRelayTeamEntry(
    existing,
    event,
    relayLetter,
    relayRound,
    gender,
    athleteGenders
  )
  if (sample && !sample.manual) {
    return NextResponse.json(
      { error: "Imported relays cannot be deleted" },
      { status: 400 }
    )
  }

  const leg1AthleteId = sample?.relaySwimmers?.find((s) => s.leg === 1)?.athleteId
  if (leg1AthleteId) {
    await deleteRelayLeadoffSwim(meet, event, leg1AthleteId, relayRound)
  }

  const entries = removeRelayTeamEntries(
    existing,
    event,
    relayLetter,
    relayRound,
    gender,
    athleteGenders
  )

  await prisma.meet.update({
    where: { id },
    data: { relayResultsSummary: { entries } },
  })

  return NextResponse.json({
    ok: true,
    removed: relayTeamKey(event, relayLetter, relayRound, gender),
  })
}

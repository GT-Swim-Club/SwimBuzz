import { softDeleteMeet } from "@/lib/recovery/recovery"
import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { buildMeetData, MeetInputError, toPrismaMeetWriteData } from "@/lib/meet/meet-input"
import {
  deleteAddedMeetFiles,
  deleteRemovedMeetFiles,
  deleteStoredMeetFile,
  nameMeetImages,
  type MeetStoredFiles,
} from "@/lib/meet/meet-storage"
import { resolveEventOrderForPacket } from "@/lib/meet/meet-packet-parse"
import { attachSheetSummaries } from "@/lib/meet/meet-sheet-resolve"
import { normalizeNameMappings, normalizeRejectedNames } from "@/lib/athlete/athlete-match"
import { MeetImportValidationError } from "@/lib/meet/meet-import-validate"
import {
  detectMeetResourceDrops,
  notifyMeetRosterOfInfoDrops } from "@/lib/meet/meet-roster-notify"
import { LOCAL_SCRAPER_HINT } from "@/lib/scraper/scraper"
import { isCuid, uniqueMeetSlug } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { meetHasEnded as meetHasEndedFn } from "@/lib/meet/meet-ended"
import { isEventOrder } from "@/lib/meet/meet-event-order"
import {
  isResultStatusesSummary,
  isSheetSummary,
  meetHasImportedResults,
  mergeMeetResultEntries,
  applyRosterGenders,
  swimsToMeetResults,
} from "@/lib/meet/meet-sheet-summary"
import { buildRosterSummary, rosterSummaryDisplayEntries } from "@/lib/meet/roster-summary-display"
import { isMixedIndividualEvent, resolveEntryEventNumber } from "@/lib/meet/event-number"
import { resolveSignupEventOptions } from "@/lib/meet/meet-signup"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"
import { buildRelayLineups } from "@/lib/meet/relay-lineups"
import { loadMeetHighlights } from "@/lib/meet/meet-highlights-load"
import { scoreMeetSwims, scoreRelayResults } from "@/lib/meet/meet-scoring"
import { syncTeamRecordsSafely } from "@/lib/records/record-sync"
import { athleteRosterNameLastFirst, athleteTeamSides, utcDayKey, isStaffRole } from "@swimbuzz/shared"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: param } = await params
  const meet = await prisma.meet.findFirst({
    where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
    include: {
      swims: {
        include: {
          athlete: {
            select: { id: true, firstName: true, lastName: true, gender: true },
          },
        },
      },
    },
  })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isStaff = isStaffRole(session.user.role)
  const [linked, seasonRoster] = await Promise.all([
    prisma.athlete.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
    prisma.athlete.findMany({
      where: { seasons: { has: meet.season } },
      select: { id: true, slug: true, firstName: true, lastName: true, preferredName: true, gender: true },
    }),
  ])
  const viewerAthleteId = linked?.id ?? null

  const ended = meetHasEndedFn({
    startsAt: meet.startsAt ?? meet.createdAt,
    endsAt: meet.endsAt,
  })

  // Finals and timed-finals swims the results gave no points score from the meet's scoring table.
  const scoredSwims = scoreMeetSwims(meet.swims, meet.scoringTable)
  const results = mergeMeetResultEntries(
    swimsToMeetResults(
      scoredSwims.map((s) => ({
        id: s.id,
        source: s.source,
        athleteId: s.athlete.id,
        athleteName: `${s.athlete.lastName}, ${s.athlete.firstName}`,
        event: s.event,
        timeMs: s.timeMs,
        tags: s.tags,
        place: s.place,
        points: s.points,
        course: s.course,
        date: utcDayKey(s.date),
      }))
    ),
    isResultStatusesSummary(meet.resultStatusesSummary)
      ? meet.resultStatusesSummary.entries
      : []
  )
  const relayResults = scoreRelayResults(
    isRelayResultsSummary(meet.relayResultsSummary) ? meet.relayResultsSummary.entries : null,
    meet.scoringTable
  )
  // Roster names and genders, so mobile can show "Baumann, Matthew (Matt)" and title its
  // by-event groups "Women 50 Free" — and the rows cleaned up as the web summary shows them.
  const rosterGenders = new Map(
    seasonRoster.map((a) => [a.id, a.gender === "F" ? ("F" as const) : ("M" as const)])
  )
  const summarySources = {
    psychSummary: isSheetSummary(meet.psychSheetSummary) ? meet.psychSheetSummary : null,
    heatSummary: isSheetSummary(meet.heatSheetSummary) ? meet.heatSheetSummary : null,
    finalsHeatSummary: isSheetSummary(meet.finalsHeatSheetSummary) ? meet.finalsHeatSheetSummary : null,
    entriesSummary: isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null,
    results,
    relayResults,
    heatLaneOverrides: meet.heatLaneOverrides,
  }
  const merged = buildRosterSummary(
    summarySources,
    rosterGenders,
    new Map(seasonRoster.map((a) => [a.id, athleteRosterNameLastFirst(a)]))
  )
  // Rows without a sheet's event number take the meet's order of events (packet or results).
  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  const rosterSummary = applyRosterGenders(
    merged
      ? {
          ...merged,
          entries: rosterSummaryDisplayEntries(merged, summarySources, rosterGenders).map((entry) => ({
            ...entry,
            ...(entry.eventNumber > 0
              ? {}
              : { eventNumber: resolveEntryEventNumber(entry, rosterGenders, eventOptions) }),
            // A combined event lists as one "Mixed" event; `gender` stays the athlete's (filters).
            ...(!meet.scoreByGender &&
            entry.entryType !== "relay_team" &&
            isMixedIndividualEvent(entry.event, eventOptions)
              ? { eventGender: "X" as const }
              : {}),
          })),
        }
      : null,
    rosterGenders
  )

  const highlights = await loadMeetHighlights({
    meet: { ...meet, swims: scoredSwims },
    results,
    relayResults,
    hasImportedResults: meetHasImportedResults({ individualResults: results, relayResults }),
  })

  // Each swimmer's team goes out as the summary's short side names ("Gold"), not as imported.
  const { swims: _swims, resultTeams, ...meetRow } = meet

  return NextResponse.json({
    ...meetRow,
    eventOrder: isEventOrder(meet.eventOrder) ? meet.eventOrder : null,
    rosterSummary,
    // Each athlete's team at a meet whose results name several of ours (an intrasquad's sides).
    athleteTeams: athleteTeamSides(resultTeams),
    highlights,
    relayLineups: buildRelayLineups(meet, seasonRoster),
    meetHasEnded: ended,
    viewer: {
      athleteId: viewerAthleteId,
      isStaff,
    },
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.meet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const nameMappings = normalizeNameMappings(body.nameMappings)
  const rejectedNames = normalizeRejectedNames(body.rejectedNames)
  const cachedSheetParses = body.cachedSheetParses ?? null

  let data: Record<string, unknown> | null = null
  try {
    data = buildMeetData(body, {
      existing: {
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        timeZone: existing.timeZone,
        hasStartTime: existing.hasStartTime,
      },
    })
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    let packetParsed = false
    let packetWarning: string | null = null
    if ("packetUrl" in data) {
      const nextPacket = (data.packetUrl as string | null) ?? null
      if (nextPacket !== existing.packetUrl) {
        if (!nextPacket) {
          data.eventOrder = null
        } else {
          try {
            data.eventOrder = await resolveEventOrderForPacket(session.user.id, nextPacket)
            packetParsed = true
          } catch (err) {
            console.error("Meet packet parse failed:", err)
            data.eventOrder = null
            packetWarning = err instanceof Error ? err.message : "Meet packet could not be parsed"
          }
        }
      }
    }

    const { nameConfirmations, rosterForPairing, cachedSheetParses: nextCachedSheetParses, sheetDrops } =
      await attachSheetSummaries(
      session.user.id,
      existing,
      data,
      { nameMappings, rejectedNames, cachedSheetParses }
    )

    // The slug is the name plus the start year, so a rename or a new date can change it.
    if ((typeof data.name === "string" && data.name !== existing.name) || "startsAt" in data) {
      const slug = await uniqueMeetSlug(typeof data.name === "string" ? data.name : existing.name, {
        startsAt: (data.startsAt as Date | undefined) ?? existing.startsAt,
        timeZone: (data.timeZone as string | undefined) ?? existing.timeZone,
        excludeId: id,
      })
      if (slug !== existing.slug) data.slug = slug
    }

    const resourceDrops = detectMeetResourceDrops(existing, data, { packetParsed })

    const images = await nameMeetImages(data, existing)
    const meet = await prisma.meet
      .update({
        where: { id },
        data: toPrismaMeetWriteData(data),
      })
      .catch(async (err) => {
        await images.rollback()
        throw err
      })
    await images.commit()
    await deleteRemovedMeetFiles(existing as MeetStoredFiles, data)
    // Records show the meet's name, only count SCY meets, and count only 25s from unofficial ones.
    if (
      meet.name !== existing.name ||
      meet.course !== existing.course ||
      meet.unofficial !== existing.unofficial
    ) {
      await syncTeamRecordsSafely()
    }

    notifyMeetRosterOfInfoDrops({
      meetId: meet.id,
      meetName: meet.name,
      drops: [...sheetDrops, ...resourceDrops]})
    return NextResponse.json({
      ...meet,
      nameConfirmations,
      rosterForPairing,
      cachedSheetParses: nextCachedSheetParses,
      packetWarning})
  } catch (err) {
    if (err instanceof MeetInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof MeetImportValidationError) {
      if (data) {
        await deleteAddedMeetFiles(existing as MeetStoredFiles, data).catch((deleteErr) => {
          console.error("Failed to delete rejected meet uploads:", deleteErr)
        })
      }
      return NextResponse.json({ error: err.message, rejected: true }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : "Failed to save meet"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return NextResponse.json({ error: LOCAL_SCRAPER_HINT }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.meet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { deleteMeet, deleteSwims } = await req.json().catch(() => ({
    deleteMeet: true,
    deleteSwims: false}))

  if (deleteSwims && !deleteMeet) {
    await prisma.swim.deleteMany({ where: { meetId: id } })

    // Also clear relayResultsSummary and result fields
    await prisma.meet.update({
      where: { id },
      data: {
        relayResultsSummary: { entries: [] },
        resultsUrl: null,
        swimphoneUrl: null,
        resultStatusesSummary: { entries: [] },
        teamScores: Prisma.DbNull,
      },
    })
    await syncTeamRecordsSafely()
  }

  if (deleteMeet) {
    await softDeleteMeet(id, Boolean(deleteSwims))
  } else if (deleteSwims) {
    try {
      await deleteStoredMeetFile(existing.resultsUrl)
    } catch (err) {
      console.error("Failed to delete results file for meet", id, err)
    }
  }

  return NextResponse.json({ ok: true })
}

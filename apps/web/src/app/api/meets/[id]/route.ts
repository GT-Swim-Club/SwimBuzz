import { softDeleteMeet } from "@/lib/recovery/recovery"
import { NextResponse } from "next/server"
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
  mergeMeetResultEntries,
  mergeSheetSummaries,
  swimsToMeetResults,
} from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"
import { utcDayKey, isStaffRole } from "@swimbuzz/shared"

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
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isStaff = isStaffRole(session.user.role)
  const linked = await prisma.athlete.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  const viewerAthleteId = linked?.id ?? null

  const ended = meetHasEndedFn({
    startsAt: meet.startsAt ?? meet.createdAt,
    endsAt: meet.endsAt,
  })

  const results = mergeMeetResultEntries(
    swimsToMeetResults(
      meet.swims.map((s) => ({
        id: s.id,
        source: s.source,
        athleteId: s.athlete.id,
        athleteName: `${s.athlete.lastName}, ${s.athlete.firstName}`,
        event: s.event,
        timeMs: s.timeMs,
        tags: s.tags,
        place: s.place,
        course: s.course,
        date: utcDayKey(s.date),
      }))
    ),
    isResultStatusesSummary(meet.resultStatusesSummary)
      ? meet.resultStatusesSummary.entries
      : []
  )
  const relayResults = isRelayResultsSummary(meet.relayResultsSummary)
    ? meet.relayResultsSummary.entries
    : null
  const rosterSummary = mergeSheetSummaries(
    isSheetSummary(meet.psychSheetSummary) ? meet.psychSheetSummary : null,
    isSheetSummary(meet.heatSheetSummary) ? meet.heatSheetSummary : null,
    results,
    relayResults,
    isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null,
    isSheetSummary(meet.finalsHeatSheetSummary)
      ? meet.finalsHeatSheetSummary
      : null
  )

  const { swims: _swims, ...meetRow } = meet

  return NextResponse.json({
    ...meetRow,
    eventOrder: isEventOrder(meet.eventOrder) ? meet.eventOrder : null,
    rosterSummary,
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

    if (typeof data.name === "string" && data.name !== existing.name) {
      data.slug = await uniqueMeetSlug(data.name, id)
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

    void notifyMeetRosterOfInfoDrops({
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
      },
    })
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

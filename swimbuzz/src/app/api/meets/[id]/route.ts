import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { buildMeetData, MeetInputError } from "@/lib/meet-input"
import { deleteAllMeetFiles, deleteRemovedMeetFiles, deleteStoredFileByUrl } from "@/lib/meet-storage"
import { resolveEventOrderForPacket } from "@/lib/meet-packet-parse"
import { attachSheetSummaries } from "@/lib/meet-sheet-resolve"
import { normalizeNameMappings, normalizeRejectedNames } from "@/lib/athlete-match"
import { MeetImportValidationError } from "@/lib/meet-import-validate"
import {
  detectMeetResourceDrops,
  notifyMeetRosterOfInfoDrops,
} from "@/lib/meet-roster-notify"
import { LOCAL_SCRAPER_HINT } from "@/lib/scraper"
import type { MeetFileUrlKey } from "@/lib/meet-files"
import { uniqueMeetSlug } from "@/lib/slug"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const meet = await prisma.meet.findUnique({ where: { id } })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(meet)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.meet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const nameMappings = normalizeNameMappings(body.nameMappings)
  const rejectedNames = normalizeRejectedNames(body.rejectedNames)
  const cachedSheetParses = body.cachedSheetParses ?? null

  try {
    const data = buildMeetData(body)
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    await deleteRemovedMeetFiles(
      existing as Record<MeetFileUrlKey, string | null> & {
        finalsHeatSheetUrls?: unknown
      },
      data
    )

    let packetParsed = false
    if ("packetUrl" in data) {
      const nextPacket = (data.packetUrl as string | null) ?? null
      const shouldParse =
        nextPacket !== existing.packetUrl || (nextPacket && !existing.eventOrder)
      if (shouldParse) {
        try {
          data.eventOrder = await resolveEventOrderForPacket(session.user.id, nextPacket)
          if (nextPacket) packetParsed = true
        } catch (err) {
          console.error("Meet packet parse failed:", err)
          data.eventOrder = null
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

    const meet = await prisma.meet.update({ where: { id }, data })

    void notifyMeetRosterOfInfoDrops({
      meetId: meet.id,
      meetName: meet.name,
      drops: [...sheetDrops, ...resourceDrops],
    })
    return NextResponse.json({
      ...meet,
      nameConfirmations,
      rosterForPairing,
      cachedSheetParses: nextCachedSheetParses,
    })
  } catch (err) {
    if (err instanceof MeetInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof MeetImportValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
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
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.meet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { deleteMeet, deleteSwims } = await req.json().catch(() => ({
    deleteMeet: true,
    deleteSwims: false,
  }))

  if (deleteSwims) {
    await prisma.swim.deleteMany({ where: { meetId: id } })
    
    // Also clear relayResultsSummary and result fields
    await prisma.meet.update({
      where: { id },
      data: { 
        relayResultsSummary: { entries: [] },
        resultsUrl: null,
        resultStatusesSummary: { entries: [] }
      }
    })
  }

  if (deleteMeet) {
    await deleteAllMeetFiles(
      existing as Record<MeetFileUrlKey, string | null> & {
        finalsHeatSheetUrls?: unknown
      }
    )
    await deleteStoredFileByUrl(existing.iconUrl)
    await deleteStoredFileByUrl(existing.bannerUrl)
    await prisma.meet.delete({ where: { id } })
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildMeetData, MeetInputError, toPrismaMeetWriteData } from "@/lib/meet-input"
import { resolveEventOrderForPacket } from "@/lib/meet-packet-parse"
import { attachSheetSummariesOnCreate } from "@/lib/meet-sheet-resolve"
import { MeetImportValidationError } from "@/lib/meet-import-validate"
import {
  detectMeetResourceDrops,
  notifyMeetRosterOfInfoDrops } from "@/lib/meet-roster-notify"
import { uniqueMeetSlug } from "@/lib/slug"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const meets = await prisma.meet.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { swims: true } }}})

  return NextResponse.json(meets)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()

  try {
    const data = buildMeetData(body, { requireName: true, requireStartDate: true })

    let packetParsed = false
    if (data.packetUrl) {
      try {
        data.eventOrder = await resolveEventOrderForPacket(session.user.id, data.packetUrl as string)
        packetParsed = true
      } catch (err) {
        console.error("Meet packet parse failed:", err)
        data.eventOrder = null
      }
    }

    const season = data.season as string
    const { sheetDrops } = await attachSheetSummariesOnCreate(session.user.id, season, data)

    const resourceDrops = detectMeetResourceDrops(
      {
        packetUrl: null,
        resultsUrl: null,
        swimphoneUrl: null,
        liveStreamUrl: null,
        rideSignUpsUrl: null,
        roomsUrl: null,
        hotel: null,
        packingList: null,
        itinerary: null},
      data,
      { packetParsed }
    )

    const meet = await prisma.meet.create({
      data: {
        ...(toPrismaMeetWriteData(data) as Parameters<typeof prisma.meet.create>[0]["data"]),
        slug: await uniqueMeetSlug(data.name as string)}})

    void notifyMeetRosterOfInfoDrops({
      meetId: meet.id,
      meetName: meet.name,
      drops: [...sheetDrops, ...resourceDrops]})
    return NextResponse.json(meet, { status: 201 })
  } catch (err) {
    if (err instanceof MeetInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof MeetImportValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}

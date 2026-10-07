import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { formatRoomLabel, validateRoomAssignmentsAgainstExclusions } from "@/lib/meet/meet-rooms"
import { loadMeetRoomContext } from "../_shared"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

type RoomInput = {
  athleteIds: string[]
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!ctx.meet.roomForm) {
    return NextResponse.json({ error: "Roommate form not set up" }, { status: 404 })
  }
  if (ctx.ended) {
    return NextResponse.json({ error: "This meet has ended" }, { status: 403 })
  }

  const body = await req.json()
  const rooms: RoomInput[] = Array.isArray(body.rooms) ? body.rooms : []
  const rosterIds = new Set(ctx.roster.map((a) => a.id))
  const rosterGenderById = new Map(ctx.roster.map((athlete) => [athlete.id, athlete.gender]))
  const assigned = new Set<string>()

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i]
    const athleteIds = Array.isArray(room.athleteIds)
      ? room.athleteIds.filter((id): id is string => typeof id === "string")
      : []
    let roomGender: (typeof ctx.roster)[number]["gender"] | undefined
    for (const athleteId of athleteIds) {
      if (!rosterIds.has(athleteId)) {
        return NextResponse.json(
          { error: "Athlete must be on this meet's roster" },
          { status: 400 }
        )
      }
      if (assigned.has(athleteId)) {
        return NextResponse.json({ error: "Each athlete can only be in one room" }, { status: 400 })
      }
      const athleteGender = rosterGenderById.get(athleteId)
      if (!athleteGender) {
        return NextResponse.json(
          { error: "Athlete gender is required for room assignment" },
          { status: 400 }
        )
      }
      if (roomGender && athleteGender !== roomGender) {
        return NextResponse.json(
          { error: "A room can only include athletes of the same gender" },
          { status: 400 }
        )
      }
      roomGender = athleteGender
      assigned.add(athleteId)
    }
  }

  const preferences = ctx.meet.roomForm.preferences.map((p) => ({
    athleteId: p.athleteId,
    preferredAthleteIds: p.preferredAthleteIds,
    excludedAthleteIds: p.excludedAthleteIds}))
  const exclusionCheck = validateRoomAssignmentsAgainstExclusions(rooms, preferences)
  if (!exclusionCheck.ok) {
    return NextResponse.json({ error: exclusionCheck.error }, { status: 400 })
  }

  const formId = ctx.meet.roomForm.id

  await prisma.$transaction(async (tx) => {
    await tx.meetRoom.deleteMany({ where: { formId } })
    for (let i = 0; i < rooms.length; i++) {
      const athleteIds = Array.isArray(rooms[i].athleteIds)
        ? rooms[i].athleteIds.filter((id): id is string => typeof id === "string")
        : []
      if (athleteIds.length === 0) continue

      const created = await tx.meetRoom.create({
        data: {
          formId,
          label: formatRoomLabel(i + 1),
          sortOrder: i}})

      await tx.meetRoomAssignment.createMany({
        data: athleteIds.map((athleteId) => ({
          roomId: created.id,
          athleteId}))})
    }
  })

  return NextResponse.json({ ok: true })
}

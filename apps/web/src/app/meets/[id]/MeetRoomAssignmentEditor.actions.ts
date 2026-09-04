"use server"

import { revalidatePath } from "next/cache"
import { formatRoomLabel, validateRoomAssignmentsAgainstExclusions } from "@/lib/meet/meet-rooms"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"
import { loadMeetRoomContext } from "@/app/api/meets/[id]/rooms/_shared"

type RoomInput = { athleteIds: string[] }

/** Same logic as PUT /api/meets/[id]/rooms/assignments — kept in sync
 * manually since the route can't be refactored without risking the
 * mobile-facing contract. */
export async function saveRoomAssignments(meetId: string, rooms: RoomInput[]) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) throw new Error("Not found")
  if (!ctx.meet.roomForm) throw new Error("Roommate form not set up")
  if (ctx.ended) throw new Error("This meet has ended")

  const rosterIds = new Set(ctx.roster.map((a) => a.id))
  const rosterGenderById = new Map(ctx.roster.map((athlete) => [athlete.id, athlete.gender]))
  const assigned = new Set<string>()

  for (const room of rooms) {
    const athleteIds = Array.isArray(room.athleteIds)
      ? room.athleteIds.filter((id): id is string => typeof id === "string")
      : []
    let roomGender: (typeof ctx.roster)[number]["gender"] | undefined
    for (const athleteId of athleteIds) {
      if (!rosterIds.has(athleteId)) throw new Error("Athlete must be on this meet's roster")
      if (assigned.has(athleteId)) throw new Error("Each athlete can only be in one room")
      const athleteGender = rosterGenderById.get(athleteId)
      if (!athleteGender) throw new Error("Athlete gender is required for room assignment")
      if (roomGender && athleteGender !== roomGender) {
        throw new Error("A room can only include athletes of the same gender")
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
  if (!exclusionCheck.ok) throw new Error(exclusionCheck.error)

  const formId = ctx.meet.roomForm.id

  await prisma.$transaction(async (tx) => {
    await tx.meetRoom.deleteMany({ where: { formId } })
    for (let i = 0; i < rooms.length; i++) {
      const athleteIds = Array.isArray(rooms[i].athleteIds)
        ? rooms[i].athleteIds.filter((id): id is string => typeof id === "string")
        : []
      if (athleteIds.length === 0) continue

      const created = await tx.meetRoom.create({
        data: { formId, label: formatRoomLabel(i + 1), sortOrder: i }})

      await tx.meetRoomAssignment.createMany({
        data: athleteIds.map((athleteId) => ({ roomId: created.id, athleteId }))})
    }
  })

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/roommates", "page")
  return { ok: true }
}

/** Same logic as PATCH /api/meets/[id]/rooms/publish. */
export async function toggleRoomPublish(meetId: string, published: boolean) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) throw new Error("Not found")
  if (!ctx.meet.roomForm) throw new Error("Roommate form not set up")
  if (ctx.ended) throw new Error("This meet has ended")

  if (published && ctx.meet.roomForm.rooms.length === 0) {
    throw new Error("Add at least one athlete to a room before publishing")
  }

  const form = await prisma.meetRoomForm.update({
    where: { id: ctx.meet.roomForm.id },
    data: { assignmentsPublishedAt: published ? new Date() : null }})

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/roommates", "page")
  return { assignmentsPublishedAt: form.assignmentsPublishedAt?.toISOString() ?? null }
}

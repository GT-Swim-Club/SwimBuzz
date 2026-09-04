"use server"

import { revalidatePath } from "next/cache"
import { Prisma, type Course } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeSwimForInsert, nextSwimOccurrence } from "@/lib/swim/swim-dedup"
import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

export type EditMeetSwimInput = {
  athleteId: string
  event: string
  course: string
  date: string
  meet: string
  meetId: string
  timeMs: number
}

/** Same logic as PATCH /api/swims/[id] (used by both web and mobile) — kept
 * in sync manually since the route can't be refactored without risking the
 * mobile-facing contract. */
export async function editMeetSwim(swimId: string, input: EditMeetSwimInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  const swim = await prisma.swim.findUnique({ where: { id: swimId } })
  if (!swim) throw new Error("Not found")
  if (swim.source !== "manual") {
    throw new Error("Only manually logged swims can be edited")
  }
  if (isRelayLeadoffSwimTag(swim.tags)) {
    throw new Error("Relay leadoff swims can only be edited through the relay")
  }

  const { athleteId, event, timeMs, course, date } = input
  if (!athleteId || !event || !Number.isFinite(timeMs) || !course || !date) {
    throw new Error("Missing required swim fields")
  }

  const base = normalizeSwimForInsert({
    athleteId,
    event,
    timeMs,
    course: course as Course,
    date,
    source: "manual",
    meet: input.meet,
    meetId: input.meetId,
    tags: swim.tags})

  let occurrence = await nextSwimOccurrence(prisma, base)

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const updated = await prisma.swim.update({
        where: { id: swimId },
        data: { ...base, occurrence }})
      revalidatePath("/meets/[id]", "page")
      return updated
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        occurrence++
        continue
      }
      throw err
    }
  }

  throw new Error("Could not save swim — too many matching duplicates")
}

/** Same logic as DELETE /api/swims/[id]. */
export async function deleteMeetSwim(swimId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  const swim = await prisma.swim.findUnique({ where: { id: swimId } })
  if (!swim) throw new Error("Not found")
  if (swim.source !== "manual") {
    throw new Error("Only manually logged swims can be deleted")
  }
  if (isRelayLeadoffSwimTag(swim.tags)) {
    throw new Error("Relay leadoff swims can only be edited through the relay")
  }

  await prisma.swim.delete({ where: { id: swimId } })
  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}

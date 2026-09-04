"use server"

import { revalidatePath } from "next/cache"
import { Prisma, type Course } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeSwimForInsert, nextSwimOccurrence } from "@/lib/swim/swim-dedup"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

export type AddAthleteSwimInput = {
  athleteId: string
  event: string
  course: string
  date: string
  meet?: string
  timeMs: number
}

/** Same logic as POST /api/swims (used by both web and mobile) — kept in
 * sync manually since the route can't be refactored without risking the
 * mobile-facing contract. */
export async function addAthleteSwim(input: AddAthleteSwimInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
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
    meet: input.meet})

  let occurrence = await nextSwimOccurrence(prisma, base)

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.swim.create({ data: { ...base, occurrence } })
      revalidatePath("/athletes/[id]", "page")
      return created
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

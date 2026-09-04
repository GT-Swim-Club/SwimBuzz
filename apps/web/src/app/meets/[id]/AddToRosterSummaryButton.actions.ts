"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createRosterOnlySheetEntry } from "@/lib/meet/meet-signup"
import { isSheetSummary } from "@/lib/meet/meet-sheet-summary"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

/** Same logic as the rosterOnly branch of POST /api/meets/[id]/sheet-entry. */
export async function addRosterOnlyEntry(meetId: string, athleteId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }
  if (!athleteId) throw new Error("athleteId is required")

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { course: true, entriesSheetSummary: true, season: true }})
  if (!meet) throw new Error("Meet not found")

  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, firstName: true, lastName: true, gender: true, seasons: true }})
  if (!athlete) throw new Error("Athlete not found")
  if (!athlete.seasons.includes(meet.season)) {
    throw new Error("Athlete must be on this meet's season roster")
  }

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const { summary, conflict } = createRosterOnlySheetEntry(existing, meet.course, {
    athleteId,
    athleteName: `${athlete.lastName}, ${athlete.firstName}`,
    gender: athlete.gender === "F" ? "F" : athlete.gender === "M" ? "M" : null})
  if (conflict) throw new Error("Athlete is already on the roster summary")

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue }})

  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}

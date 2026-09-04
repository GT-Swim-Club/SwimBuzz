"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { deleteRosterOnlySheetEntry } from "@/lib/meet/meet-signup"
import { isSheetSummary } from "@/lib/meet/meet-sheet-summary"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

/** Same logic as the rosterOnly branch of DELETE /api/meets/[id]/sheet-entry. */
export async function removeRosterOnlyEntry(meetId: string, athleteId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }
  if (!athleteId) throw new Error("athleteId is required")

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { course: true, entriesSheetSummary: true }})
  if (!meet) throw new Error("Meet not found")

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const { summary, found } = deleteRosterOnlySheetEntry(existing, meet.course, athleteId)
  if (!found) throw new Error("Athlete not found on roster summary")

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue }})

  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}

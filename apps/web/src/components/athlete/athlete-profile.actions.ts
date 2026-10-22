"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { isStaffRole } from "@swimbuzz/shared"
import { resolveSwimCloudProfilesUpdate } from "@/lib/swim/swimcloud-profiles"
import { getSession } from "@/lib/auth/session"

async function requireStaff() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")
  return session
}

/** Coach sets (or clears) an athlete's SwimCloud IDs, main first. */
export async function updateSwimCloudIds(athleteId: string, swimCloudIds: number[]) {
  await requireStaff()
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { swimCloudIds: true },
  })
  if (!athlete) throw new Error("Not found")

  const profiles = await resolveSwimCloudProfilesUpdate(athlete, { swimCloudIds }, athleteId)
  await prisma.athlete.update({ where: { id: athleteId }, data: profiles })
  revalidatePath("/athletes/[id]", "page")
}

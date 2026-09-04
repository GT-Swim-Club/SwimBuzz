"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

/** Same logic as DELETE /api/swims/[id]. */
export async function deleteAthleteSwim(swimId: string) {
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
  revalidatePath("/athletes/[id]", "page")
  return { ok: true }
}

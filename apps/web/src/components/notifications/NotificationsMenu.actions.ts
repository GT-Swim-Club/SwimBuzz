"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

/** Shared with PATCH /api/notifications — same logic, kept in sync manually
 * since the route can't be refactored without risking the mobile-facing
 * contract. */
export async function markNotificationsRead(id?: string) {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")

  const now = new Date()
  if (id) {
    await prisma.notification.updateMany({
      where: { id, userId: session.user.id, readAt: null },
      data: { readAt: now }})
  } else {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: now }})
  }

  revalidatePath("/", "layout")
}

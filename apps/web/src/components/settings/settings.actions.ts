"use server"

import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import {
  isNotificationPreferenceKey,
  mergeNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@/lib/notifications/notification-preferences"

export async function updateNotificationPreference(
  key: NotificationPreferenceKey,
  value: boolean
): Promise<NotificationPreferences> {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")

  const patch: Partial<NotificationPreferences> = {}
  // Same rules as PATCH /api/notifications/preferences: any key in the shared list.
  if (!isNotificationPreferenceKey(key) || typeof value !== "boolean") {
    throw new Error(`Invalid value for ${key}`)
  }
  patch[key] = value

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPreferences: true }})
  if (!existing) throw new Error("Not found")

  const preferences = mergeNotificationPreferences(existing.notificationPreferences, patch)

  await prisma.user.update({
    where: { id: session.user.id },
    data: { notificationPreferences: preferences as Prisma.InputJsonValue }})

  return preferences
}

export async function updateAlertSound(enabled: boolean): Promise<boolean> {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")
  if (typeof enabled !== "boolean") throw new Error("Invalid value")

  await prisma.user.update({
    where: { id: session.user.id },
    data: { alertSound: enabled }})

  // The root layout feeds this to ImportTaskProvider.
  revalidatePath("/", "layout")
  return enabled
}

"use server"

import { Prisma } from "@prisma/client"
import {
  mergeNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences } from "@/lib/notifications/notification-preferences"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

/** Shared with PATCH /api/notifications/preferences — same logic, kept in
 * sync manually since the route can't be refactored without risking the
 * mobile-facing contract. */

const PATCH_KEYS: NotificationPreferenceKey[] = [
  "practicePublished",
  "meetRosterInfo",
  "practiceComments",
  "profileChanges",
]

export async function updateNotificationPreference(
  key: NotificationPreferenceKey | "meetSignupNotificationTimes",
  value: boolean | number | number[]
): Promise<NotificationPreferences> {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")

  const patch: Partial<NotificationPreferences> = {}
  if (key === "meetSignupNotificationTimes") {
    if (!Array.isArray(value)) throw new Error("Invalid value for meetSignupNotificationTimes")
    patch.meetSignupNotificationTimes = value.filter(
      (m): m is number => typeof m === "number" && m >= 0 && m <= 60
    )
  } else if (PATCH_KEYS.includes(key)) {
    if (typeof value !== "boolean") throw new Error(`Invalid value for ${key}`)
    patch[key] = value
  } else {
    throw new Error(`Invalid value for ${key}`)
  }

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

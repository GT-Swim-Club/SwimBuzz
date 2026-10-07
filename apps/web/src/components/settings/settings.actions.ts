"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { Prisma } from "@prisma/client"
import {
  mergeNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@/lib/notifications/notification-preferences"

/** Shared with PATCH /api/user/view-preference — same logic, kept in sync
 * manually since the route can't be refactored without risking the
 * mobile-facing contract. */

function normalizeView(value: unknown) {
  return value === "list" ? "list" : "gallery"
}

function normalizePracticesView(value: unknown) {
  return value === "week" || value === "month" || value === "list" ? value : "week"
}

export async function updateViewPreference(input: {
  defaultView?: string
  defaultPracticesView?: string
}) {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")

  const data: {
    defaultView?: "list" | "gallery"
    defaultPracticesView?: "week" | "month" | "list"
  } = {}
  if (input.defaultView) data.defaultView = normalizeView(input.defaultView)
  if (input.defaultPracticesView) {
    data.defaultPracticesView = normalizePracticesView(input.defaultPracticesView)
  }

  await prisma.user.update({ where: { id: session.user.id }, data })
  revalidatePath("/", "layout")
}

/** Shared with PATCH /api/notifications/preferences — same logic, kept in
 * sync manually since the route can't be refactored without risking the
 * mobile-facing contract. */

const PATCH_KEYS: NotificationPreferenceKey[] = [
  "practicePublished",
  "meetRosterInfo",
  "meetDrops",
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

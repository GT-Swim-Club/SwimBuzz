import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import {
  mergeNotificationPreferences,
  parseNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences } from "@/lib/notifications/notification-preferences"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

const PATCH_KEYS: NotificationPreferenceKey[] = [
  "practicePublished",
  "meetRosterInfo",
  "practiceComments",
  "profileChanges",
]

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPreferences: true }})

  return NextResponse.json({
    preferences: parseNotificationPreferences(user?.notificationPreferences)})
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const patch: Partial<NotificationPreferences> = {}
  for (const key of PATCH_KEYS) {
    if (key in body) {
      if (typeof (body as Record<string, unknown>)[key] !== "boolean") {
        return NextResponse.json(
          { error: `Invalid value for ${key}` },
          { status: 400 }
        )
      }
      patch[key] = (body as Record<string, boolean>)[key]
    }
  }

  if (Array.isArray(body.meetSignupNotificationTimes)) {
    patch.meetSignupNotificationTimes = body.meetSignupNotificationTimes.filter(
      (m: any): m is number => typeof m === "number" && m >= 0 && m <= 60
    )
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No preferences provided" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPreferences: true }})
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const preferences = mergeNotificationPreferences(
    existing.notificationPreferences,
    patch
  )

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      notificationPreferences: preferences as Prisma.InputJsonValue}})

  return NextResponse.json({ preferences })
}

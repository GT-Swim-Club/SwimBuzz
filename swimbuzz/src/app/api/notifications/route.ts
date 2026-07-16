import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import {
  notificationRetentionCutoff,
  purgeExpiredNotifications,
} from "@/lib/notifications"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await purgeExpiredNotifications(session.user.id)

  const notifications = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      createdAt: { gte: notificationRetentionCutoff() },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  })

  return NextResponse.json({ notifications })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const now = new Date()

  if (body.all === true) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: now },
    })
    return NextResponse.json({ ok: true })
  }

  if (typeof body.id === "string") {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: session.user.id, readAt: null },
      data: { readAt: now },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 })
}

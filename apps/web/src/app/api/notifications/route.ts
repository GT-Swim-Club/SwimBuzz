import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      href: true,
      athleteId: true,
      readAt: true,
      seenAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ notifications })
}

/**
 * `{ seen: true }` — the list was opened: clears the badge, items stay unread (highlighted).
 * `{ id }` — one was tapped: read. `{ all: true }` — mark every one read.
 */
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const now = new Date()
  const userId = session.user.id

  if (body?.seen === true) {
    await prisma.notification.updateMany({
      where: { userId, seenAt: null },
      data: { seenAt: now },
    })
    return NextResponse.json({ ok: true })
  }

  if (body?.all === true) {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now, seenAt: now },
    })
    return NextResponse.json({ ok: true })
  }

  if (typeof body?.id === "string") {
    await prisma.notification.updateMany({
      where: { id: body.id, userId, readAt: null },
      data: { readAt: now, seenAt: now },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 })
}

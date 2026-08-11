import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId: session.user.id},
    orderBy: { createdAt: "desc" },
    take: 50})

  return NextResponse.json({ notifications })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const now = new Date()

  if (body.all === true) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: now }})
    return NextResponse.json({ ok: true })
  }

  if (typeof body.id === "string") {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: session.user.id, readAt: null },
      data: { readAt: now }})
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 })
}

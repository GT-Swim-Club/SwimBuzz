import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const comment = await prisma.practiceComment.findUnique({ where: { id } })
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isCoach = session.user.role === "COACH"
  const isAuthor = comment.authorId === session.user.id
  if (!isCoach && !isAuthor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const text = String(body.body ?? "").trim()
  if (!text) {
    return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 })
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 })
  }

  const updated = await prisma.practiceComment.update({
    where: { id },
    data: { body: text },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const comment = await prisma.practiceComment.findUnique({ where: { id } })
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isCoach = session.user.role === "COACH"
  const isAuthor = comment.authorId === session.user.id
  if (!isCoach && !isAuthor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.practiceComment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

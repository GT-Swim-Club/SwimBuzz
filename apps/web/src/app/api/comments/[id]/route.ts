import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"

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

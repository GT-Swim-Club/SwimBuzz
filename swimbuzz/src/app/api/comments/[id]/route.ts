import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const comment = await prisma.practiceComment.findUnique({ where: { id } })
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isCoach = ["COACH", "EXEC"].includes(session.user.role)
  const isAuthor = comment.authorId === session.user.id
  if (!isCoach && !isAuthor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.practiceComment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

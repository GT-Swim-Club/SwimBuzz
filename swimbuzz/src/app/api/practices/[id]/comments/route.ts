import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const practice = await prisma.practice.findUnique({ where: { id }, select: { id: true } })
  if (!practice) return NextResponse.json({ error: "Practice not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const text = String(body.body ?? "").trim()
  if (!text) return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 })
  if (text.length > 2000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 })
  }

  const comment = await prisma.practiceComment.create({
    data: {
      practiceId: id,
      authorId: session.user.id,
      authorName: session.user.name ?? "Someone",
      body: text,
    },
  })

  return NextResponse.json(comment, { status: 201 })
}

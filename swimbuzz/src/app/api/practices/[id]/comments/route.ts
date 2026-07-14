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

  let parentId: string | null = null
  if (body.parentId != null && body.parentId !== "") {
    const parent = await prisma.practiceComment.findUnique({
      where: { id: String(body.parentId) },
      select: { id: true, practiceId: true, parentId: true },
    })
    if (!parent || parent.practiceId !== id) {
      return NextResponse.json({ error: "Parent comment not found" }, { status: 400 })
    }
    // Flatten to one level: replies attach to the top-level comment
    parentId = parent.parentId ?? parent.id
  }

  const comment = await prisma.practiceComment.create({
    data: {
      practiceId: id,
      authorId: session.user.id,
      authorName: session.user.name ?? "Someone",
      body: text,
      parentId,
    },
  })

  return NextResponse.json(comment, { status: 201 })
}

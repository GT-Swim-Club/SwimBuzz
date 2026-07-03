import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { buildMeetData, MeetInputError } from "@/lib/meet-input"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const meet = await prisma.meet.findUnique({ where: { id } })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(meet)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.meet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()

  try {
    const data = buildMeetData(body)
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }
    const meet = await prisma.meet.update({ where: { id }, data })
    return NextResponse.json(meet)
  } catch (err) {
    if (err instanceof MeetInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.meet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Swims stay in the DB; their meetId is cleared via onDelete: SetNull.
  await prisma.meet.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

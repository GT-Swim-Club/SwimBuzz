import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { loadMeetRoomContext } from "../_shared"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!ctx.meet.roomForm) {
    return NextResponse.json({ error: "Roommate form not set up" }, { status: 404 })
  }
  if (ctx.ended) {
    return NextResponse.json({ error: "This meet has ended" }, { status: 403 })
  }

  const body = await req.json()
  const published = body.published === true

  if (published && ctx.meet.roomForm.rooms.length === 0) {
    return NextResponse.json(
      { error: "Add at least one athlete to a room before publishing" },
      { status: 400 }
    )
  }

  const form = await prisma.meetRoomForm.update({
    where: { id: ctx.meet.roomForm.id },
    data: {
      assignmentsPublishedAt: published ? new Date() : null,
    },
  })

  return NextResponse.json({
    assignmentsPublishedAt: form.assignmentsPublishedAt?.toISOString() ?? null,
  })
}

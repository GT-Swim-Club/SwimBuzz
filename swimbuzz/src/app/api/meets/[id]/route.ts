import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { buildMeetData, MeetInputError } from "@/lib/meet-input"
import { deleteAllMeetFiles, deleteRemovedMeetFiles } from "@/lib/meet-storage"
import { resolveEventOrderForPacket } from "@/lib/meet-packet-parse"
import { attachSheetSummaries } from "@/lib/meet-sheet-resolve"
import type { MeetFileUrlKey } from "@/lib/meet-files"

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
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
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

    await deleteRemovedMeetFiles(
      existing as Record<MeetFileUrlKey, string | null>,
      data
    )

    if ("packetUrl" in data) {
      const nextPacket = (data.packetUrl as string | null) ?? null
      const shouldParse =
        nextPacket !== existing.packetUrl || (nextPacket && !existing.eventOrder)
      if (shouldParse) {
        try {
          data.eventOrder = await resolveEventOrderForPacket(nextPacket)
        } catch (err) {
          console.error("Meet packet parse failed:", err)
          data.eventOrder = null
        }
      }
    }

    await attachSheetSummaries(existing, data)

    const meet = await prisma.meet.update({ where: { id }, data })
    return NextResponse.json(meet)
  } catch (err) {
    if (err instanceof MeetInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : "Failed to save meet"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.meet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await deleteAllMeetFiles(existing as Record<MeetFileUrlKey, string | null>)

  // Swims stay in the DB; their meetId is cleared via onDelete: SetNull.
  await prisma.meet.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

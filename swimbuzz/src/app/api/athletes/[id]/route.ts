import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const swimCloudId = parseInt(String(body.swimCloudId ?? ""), 10)

  if (!Number.isFinite(swimCloudId) || swimCloudId <= 0) {
    return NextResponse.json({ error: "SwimCloud ID must be a positive number" }, { status: 400 })
  }

  const athlete = await prisma.athlete.findUnique({ where: { id } })
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (athlete.swimCloudId !== null) {
    return NextResponse.json({ error: "SwimCloud ID is already set" }, { status: 400 })
  }

  const existing = await prisma.athlete.findFirst({ where: { swimCloudId } })
  if (existing) {
    return NextResponse.json({ error: "An athlete with this SwimCloud ID already exists" }, { status: 409 })
  }

  const updated = await prisma.athlete.update({
    where: { id },
    data: { swimCloudId },
  })

  return NextResponse.json(updated)
}

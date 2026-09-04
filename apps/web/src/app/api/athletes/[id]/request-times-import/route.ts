import { NextResponse } from "next/server"
import { isStaffRole } from "@/lib/auth/auth-roles"
import { notifyTimesImportRequest } from "@/lib/notifications/notifications"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Staff can import times themselves; this endpoint is for athletes.
  if (isStaffRole(session.user.role)) {
    return NextResponse.json(
      { error: "Coaches can import times directly from the athlete page" },
      { status: 400 }
    )
  }

  const { id } = await params
  const athlete = await prisma.athlete.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      swimCloudId: true,
      timesSyncedAt: true}})
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (athlete.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (athlete.swimCloudId == null) {
    return NextResponse.json(
      { error: "Set a SwimCloud ID before requesting a times import" },
      { status: 400 }
    )
  }

  await notifyTimesImportRequest({
    athleteId: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    swimCloudId: athlete.swimCloudId,
    timesSyncedAt: athlete.timesSyncedAt})

  return NextResponse.json({ ok: true })
}

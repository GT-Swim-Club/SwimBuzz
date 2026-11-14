import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { notifyTimesImportRequest, timesImportRequestRetryAt } from "@/lib/notifications/notifications"
import { runAfterResponse } from "@/lib/notifications/after-response"
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
      swimCloudIds: true,
      timesSyncedAt: true}})
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (athlete.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const swimCloudIds = athlete.swimCloudIds
  if (swimCloudIds.length === 0) {
    return NextResponse.json(
      { error: "Ask a coach to add your SwimCloud ID before requesting a times import" },
      { status: 400 }
    )
  }

  // One open request at a time: staff are notified (and pushed) again only after the cooldown,
  // or once the requested import has run.
  const retryAt = await timesImportRequestRetryAt(athlete.id)
  if (retryAt) {
    const retryAfterSeconds = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000))
    const hours = Math.ceil(retryAfterSeconds / 3600)
    return NextResponse.json(
      {
        error: `You already asked for a times import. You can ask again in ${hours} hour${hours === 1 ? "" : "s"}.`,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  runAfterResponse("times import request notification", () =>
    notifyTimesImportRequest({
      athleteId: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      swimCloudIds,
      timesSyncedAt: athlete.timesSyncedAt,
    })
  )

  return NextResponse.json({ ok: true })
}

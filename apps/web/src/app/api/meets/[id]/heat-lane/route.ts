import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { saveMeetHeatLane } from "@/lib/meet/heat-lane-save"

export const runtime = "nodejs"

/** Set (or clear) a roster summary row's coach heat & lane for one round. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const body = await req.json().catch(() => null)
  try {
    await saveMeetHeatLane(meetId, body)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save heat & lane"
    return NextResponse.json({ error: message }, { status: message === "Meet not found" ? 404 : 400 })
  }
  return NextResponse.json({ ok: true })
}

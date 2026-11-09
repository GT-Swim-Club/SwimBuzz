import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { removeTeamRecord } from "@/lib/records/records"

/** Remove one record from an event's history. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  if (!(await removeTeamRecord(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

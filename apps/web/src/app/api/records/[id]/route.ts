import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { RecordInputError, removeTeamRecord } from "@/lib/records/records"

/** Remove one staff-set record from an event's history (imported and records-sheet ones can't be). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  try {
    if (!(await removeTeamRecord(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    if (error instanceof RecordInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
  return NextResponse.json({ ok: true })
}

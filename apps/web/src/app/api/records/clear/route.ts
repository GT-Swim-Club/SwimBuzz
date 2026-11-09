import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { clearTeamRecord, listTeamRecords, RecordInputError } from "@/lib/records/records"

/** Clear an event's current record; returns the updated table. */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = (await req.json().catch(() => null)) as { gender?: unknown; event?: unknown } | null
  try {
    await clearTeamRecord(body?.gender, body?.event)
  } catch (error) {
    if (error instanceof RecordInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
  return NextResponse.json(await listTeamRecords())
}

import { NextResponse } from "next/server"
import { isStaffRole, type TeamRecordEditInput } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { editTeamRecord, listTeamRecords, RecordInputError } from "@/lib/records/records"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await listTeamRecords())
}

/** Staff edit of one event's record (see editTeamRecord). Returns the updated table. */
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = (await req.json().catch(() => null)) as TeamRecordEditInput | null
  try {
    await editTeamRecord(body as TeamRecordEditInput, session.user.id)
  } catch (error) {
    if (error instanceof RecordInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
  return NextResponse.json(await listTeamRecords())
}

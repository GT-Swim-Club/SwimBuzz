import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { RecordInputError, teamRecordHistory } from "@/lib/records/records"

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(req.url)
  try {
    return NextResponse.json(await teamRecordHistory(url.searchParams.get("gender"), url.searchParams.get("event")))
  } catch (error) {
    if (error instanceof RecordInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}

import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { RecordInputError } from "@/lib/records/records"
import { teamAllTopTimesCached } from "@/lib/records/record-top-times"

/** Every record event's top 10 (SCY) for one gender: ?gender=F|M&mode=performers|performances. */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(req.url)
  try {
    return NextResponse.json(await teamAllTopTimesCached(url.searchParams.get("gender"), url.searchParams.get("mode")))
  } catch (error) {
    if (error instanceof RecordInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}

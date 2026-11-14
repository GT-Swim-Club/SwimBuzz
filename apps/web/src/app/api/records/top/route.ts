import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { RecordInputError } from "@/lib/records/records"
import { teamTopTimes } from "@/lib/records/record-top-times"

/** An event's top 10 (SCY): ?gender=F&event=50%20Free&mode=performers|performances. */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(req.url)
  try {
    return NextResponse.json(
      await teamTopTimes(url.searchParams.get("gender"), url.searchParams.get("event"), url.searchParams.get("mode"))
    )
  } catch (error) {
    if (error instanceof RecordInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}

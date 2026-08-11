import { NextResponse } from "next/server"
import { disconnectScraperByToken } from "@/lib/scraper"

/** Called by the local scraper on exit so the app stops showing "running". */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = auth.slice("Bearer ".length).trim()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await disconnectScraperByToken(token)
  return NextResponse.json({ ok: true })
}

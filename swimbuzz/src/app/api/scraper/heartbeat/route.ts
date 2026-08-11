import { NextResponse } from "next/server"
import { requireScraperConnection } from "@/lib/scraper-auth"

export async function POST(req: Request) {
  const { connection, error } = await requireScraperConnection(req)
  if (!connection) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}

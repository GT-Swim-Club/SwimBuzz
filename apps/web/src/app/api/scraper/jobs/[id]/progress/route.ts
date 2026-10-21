import { NextResponse } from "next/server"
import { updateScraperJobProgress } from "@/lib/scraper/scraper"
import { requireScraperConnection } from "@/lib/scraper/scraper-auth"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { connection, error } = await requireScraperConnection(req)
  if (!connection) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "progress object is required" }, { status: 400 })
  }

  const updated = await updateScraperJobProgress(id, connection.id, body)
  return NextResponse.json({ ok: updated })
}

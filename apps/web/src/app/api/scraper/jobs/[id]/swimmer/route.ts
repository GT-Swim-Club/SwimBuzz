import { NextResponse } from "next/server"
import { saveStreamedSwimmerTimes } from "@/lib/swim/times-sync-partial"
import { requireScraperConnection } from "@/lib/scraper/scraper-auth"

export const runtime = "nodejs"
export const maxDuration = 60

/** The desktop scraper posts each swimmer's times as it finishes, so a job that dies partway keeps them. */
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
  const swimmerId = Number(body?.swimmerId)
  if (!Number.isInteger(swimmerId) || swimmerId <= 0) {
    return NextResponse.json({ error: "swimmerId is required" }, { status: 400 })
  }

  const saved = await saveStreamedSwimmerTimes(id, connection.id, swimmerId, body.times)
  return NextResponse.json({ ok: saved })
}

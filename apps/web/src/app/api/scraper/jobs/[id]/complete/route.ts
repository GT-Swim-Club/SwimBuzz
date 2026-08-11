import { NextResponse } from "next/server"
import { completeScraperJob, failScraperJob } from "@/lib/scraper"
import { requireScraperConnection } from "@/lib/scraper-auth"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { connection, error } = await requireScraperConnection(req)
  if (!connection) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  try {
    if (body.error) {
      await failScraperJob(id, connection.id, String(body.error))
      return NextResponse.json({ ok: true })
    }

    if (!("result" in body)) {
      return NextResponse.json({ error: "result or error is required" }, { status: 400 })
    }

    await completeScraperJob(id, connection.id, body.result)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not complete job" },
      { status: 400 }
    )
  }
}

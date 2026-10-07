import { NextResponse } from "next/server"
import { disconnectScraper, getActiveScraperConnection } from "@/lib/scraper/scraper"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export async function GET() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const connection = await getActiveScraperConnection(session.user.id)
    return NextResponse.json({
      connected: !!connection,
      lastSeenAt: connection?.lastSeenAt.toISOString() ?? null})
  } catch (err) {
    console.error("[scraper/status]", err)
    return NextResponse.json(
      {
        error:
          "Scraper service unavailable — restart the dev server after running `npx prisma generate`"},
      { status: 500 }
    )
  }
}

export async function DELETE() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await disconnectScraper(session.user.id)
  return NextResponse.json({ ok: true })
}

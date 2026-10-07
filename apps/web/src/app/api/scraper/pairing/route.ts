import { NextResponse } from "next/server"
import { createScraperPairing } from "@/lib/scraper/scraper"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export async function POST() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const pairing = await createScraperPairing(session.user.id)
    return NextResponse.json({
      code: pairing.code,
      expiresAt: pairing.expiresAt.toISOString()})
  } catch (err) {
    console.error("[scraper/pairing]", err)
    const message = err instanceof Error ? err.message : "Could not generate code"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

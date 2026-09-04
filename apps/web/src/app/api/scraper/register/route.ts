import { NextResponse } from "next/server"
import { registerScraperConnection } from "@/lib/scraper/scraper"
import { checkScraperRegisterRateLimit } from "@/lib/scraper/scraper-register-rate-limit"

export async function POST(req: Request) {
  const rateLimit = checkScraperRegisterRateLimit(req)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    )
  }

  const { code } = await req.json().catch(() => ({}))
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Pairing code is required" }, { status: 400 })
  }

  try {
    const connection = await registerScraperConnection(code.trim())
    return NextResponse.json({
      token: connection.token,
      connectionId: connection.id,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Registration failed" },
      { status: 400 }
    )
  }
}

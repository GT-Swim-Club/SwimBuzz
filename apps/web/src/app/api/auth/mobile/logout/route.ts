import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { revokeMobileRefreshToken } from "@/lib/auth/mobile-auth"

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const refreshToken = String(body.refreshToken ?? "")
  if (refreshToken) {
    await revokeMobileRefreshToken(refreshToken)
  }
  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"
import { rotateMobileRefreshToken } from "@/lib/mobile-auth"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const refreshToken = String(body.refreshToken ?? "")
  if (!refreshToken) {
    return NextResponse.json(
      { error: "refreshToken is required" },
      { status: 400 }
    )
  }

  const tokens = await rotateMobileRefreshToken(refreshToken)
  if (!tokens) {
    return NextResponse.json(
      { error: "Invalid or expired refresh token" },
      { status: 401 }
    )
  }

  return NextResponse.json(tokens)
}

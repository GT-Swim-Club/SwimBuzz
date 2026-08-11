import { NextResponse } from "next/server"
import { verifyEmailLoginCode } from "@/lib/email-login"
import { issueMobileTokens } from "@/lib/mobile-auth"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? "")
  const code = String(body.code ?? "")
  if (!email || !code) {
    return NextResponse.json(
      { error: "Email and code are required" },
      { status: 400 }
    )
  }

  const user = await verifyEmailLoginCode(email, code)
  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired code" },
      { status: 401 }
    )
  }

  const tokens = await issueMobileTokens(user)
  return NextResponse.json(tokens)
}

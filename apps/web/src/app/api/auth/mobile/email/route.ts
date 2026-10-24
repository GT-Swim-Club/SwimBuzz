import { NextResponse } from "next/server"
import { verifyEmailLoginCode } from "@/lib/auth/email-login"
import { issueMobileTokens } from "@/lib/auth/mobile-auth"
import { demoteStaffToAthlete } from "@/lib/auth/staff-demote"

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

  // This direct-session path is athlete-only: signing in here drops any
  // coach/exec rank until the user signs in again via staff/verify + google.
  const tokens = await issueMobileTokens(await demoteStaffToAthlete(user))
  return NextResponse.json(tokens)
}

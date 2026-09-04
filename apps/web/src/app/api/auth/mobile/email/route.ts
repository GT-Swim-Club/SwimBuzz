import { NextResponse } from "next/server"
import { verifyEmailLoginCode } from "@/lib/auth/email-login"
import { issueMobileTokens } from "@/lib/auth/mobile-auth"
import { STAFF_MUST_USE_STAFF_TAB_ERROR } from "@swimbuzz/shared"

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

  // Coach/exec accounts must sign in through the staff two-step flow
  // (staff/verify + google) so their session is only ever issued after the
  // Google step — this direct-session path is athlete-only.
  if (user.staffTitle) {
    return NextResponse.json(
      { error: STAFF_MUST_USE_STAFF_TAB_ERROR },
      { status: 403 }
    )
  }

  const tokens = await issueMobileTokens(user)
  return NextResponse.json(tokens)
}

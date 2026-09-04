import { NextResponse } from "next/server"
import { verifyEmailLoginCode } from "@/lib/auth/email-login"
import { signStaffLinkToken } from "@/lib/auth/staff-link"

/**
 * Mobile equivalent of /api/auth/staff/verify — step 1 of coach/exec sign-in.
 * Verifies the GT-email OTP and returns a short-lived staff-link token in the
 * response body (mobile has no cookie jar shared with the web origin). Step 2
 * (POST /api/auth/mobile/google) redeems it and only then issues session tokens.
 */
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

  const staffLinkToken = await signStaffLinkToken({ id: user.id, email: user.email })
  return NextResponse.json({ staffLinkToken })
}

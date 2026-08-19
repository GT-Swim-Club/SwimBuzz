import { NextResponse } from "next/server"
import { verifyEmailLoginCode } from "@/lib/email-login"
import { signStaffLinkToken, setStaffLinkCookie } from "@/lib/staff-link"

/**
 * Step 1 of coach/exec sign-in: verify the GT-email OTP and set a short-lived
 * HttpOnly staff-link cookie naming the roster user — but do NOT sign the
 * user in yet. Step 2 (Google, in the NextAuth `signIn` callback) redeems
 * this cookie and only then issues a session.
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

  const token = await signStaffLinkToken({ id: user.id, email: user.email })
  await setStaffLinkCookie(token)

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { issueMobileTokens, verifyGoogleIdToken } from "@/lib/mobile-auth"
import { verifyStaffLinkToken } from "@/lib/staff-link"
import {
  currentStaffTerm,
  staffAccountForEmail,
  STAFF_ONLY_SIGNIN_ERROR,
} from "@swimbuzz/shared"

/**
 * Step 2 of mobile coach/exec sign-in. The Google account must be one of the
 * @gtswimclub.com staff mailboxes, and the caller must already hold a valid
 * staff-link token from step 1 (POST /api/auth/mobile/staff/verify), proving
 * they verified their own GT-email OTP first. On success the Google
 * credential is linked to that ROSTER user (never a new user) and the
 * role/title are (re)stamped for the current staff term.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const idToken = String(body.idToken ?? "")
  const staffLinkToken = String(body.staffLinkToken ?? "")
  if (!idToken || !staffLinkToken) {
    return NextResponse.json(
      { error: "idToken and staffLinkToken are required" },
      { status: 400 }
    )
  }

  const google = await verifyGoogleIdToken(idToken)
  if (!google) {
    return NextResponse.json({ error: "Invalid Google token" }, { status: 401 })
  }

  const staff = staffAccountForEmail(google.email)
  if (!staff) {
    return NextResponse.json({ error: STAFF_ONLY_SIGNIN_ERROR }, { status: 403 })
  }

  const link = await verifyStaffLinkToken(staffLinkToken)
  if (!link) {
    return NextResponse.json(
      { error: "Verify your Georgia Tech email first, then continue with Google." },
      { status: 401 }
    )
  }

  const [, user] = await prisma.$transaction([
    prisma.account.upsert({
      where: {
        provider_providerAccountId: { provider: "google", providerAccountId: google.sub },
      },
      create: {
        userId: link.sub,
        type: "oauth",
        provider: "google",
        providerAccountId: google.sub,
      },
      update: { userId: link.sub },
    }),
    prisma.user.update({
      where: { id: link.sub },
      data: { role: staff.role, staffTitle: staff.title, staffTerm: currentStaffTerm() },
    }),
  ])

  const tokens = await issueMobileTokens(user)
  return NextResponse.json(tokens)
}

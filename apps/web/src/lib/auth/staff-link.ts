import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

/**
 * Short-lived proof that a user has already verified their GT-email OTP as
 * part of the coach/exec sign-in flow (step 1). Step 2 (Google, bound to
 * @gtswimclub.com) redeems it to link the Google credential to that same
 * roster user — see the `signIn` callback in
 * apps/web/src/app/api/auth/[...nextauth]/route.ts.
 *
 * Deliberately NOT a NextAuth session: verifying the GT email alone must
 * never sign anyone in on its own, only the Google step does that.
 */
const STAFF_LINK_TTL_SEC = 10 * 60 // 10 minutes
export const STAFF_LINK_COOKIE = "swimbuzz-staff-link"

export type StaffLinkClaims = {
  sub: string
  email: string
  typ: "staff_link"
}

function secretKey() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set")
  return new TextEncoder().encode(secret)
}

export async function signStaffLinkToken(user: {
  id: string
  email: string
}): Promise<string> {
  return new SignJWT({ email: user.email, typ: "staff_link" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${STAFF_LINK_TTL_SEC}s`)
    .sign(secretKey())
}

export async function verifyStaffLinkToken(
  token: string
): Promise<StaffLinkClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    if (payload.typ !== "staff_link" || typeof payload.sub !== "string") {
      return null
    }
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      typ: "staff_link",
    }
  } catch {
    return null
  }
}

/** Set the HttpOnly staff-link cookie (web step 1 → step 2 handoff). Same-origin, survives the Google redirect. */
export async function setStaffLinkCookie(token: string) {
  const store = await cookies()
  store.set(STAFF_LINK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_LINK_TTL_SEC,
  })
}

/**
 * Read + verify the staff-link cookie and clear it — single use. Called from
 * the NextAuth `signIn` callback during the Google step, so a Google sign-in
 * can never succeed twice off one GT-email verification.
 */
export async function readAndClearStaffLinkCookie(): Promise<StaffLinkClaims | null> {
  const store = await cookies()
  const raw = store.get(STAFF_LINK_COOKIE)?.value
  store.delete(STAFF_LINK_COOKIE)
  if (!raw) return null
  return verifyStaffLinkToken(raw)
}

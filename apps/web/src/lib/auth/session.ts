import { cache } from "react"
import { headers } from "next/headers"
import { getServerSession } from "next-auth"
import type { Session } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import {
  sessionFromMobileClaims,
  verifyMobileAccessToken,
} from "@/lib/auth/mobile-auth"

/**
 * Resolve the current user from either:
 * - Authorization: Bearer <mobile access JWT>
 * - NextAuth cookie session (web)
 *
 * Wrapped in React cache() — many server components on the same request tree
 * (layout, page, nested sections) call this independently, so this collapses
 * repeat calls in one render into a single cookie/JWT/DB round trip.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const h = await headers()
  const auth = h.get("authorization")
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim()
    const claims = await verifyMobileAccessToken(token)
    if (!claims) return null
    return sessionFromMobileClaims(claims)
  }
  return getServerSession(authOptions)
})

/** Prefer getSession() — supports cookie + Bearer. */
export async function getSessionFromRequest(
  _req?: Request
): Promise<Session | null> {
  return getSession()
}

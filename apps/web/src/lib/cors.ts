import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Only the web app's own origin (plus localhost in dev) is allowlisted.
 * The mobile app authenticates with a Bearer token from a native HTTP client,
 * which browsers' CORS enforcement never applies to — it doesn't send an
 * Origin header and needs no entry here.
 */
function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false
  if (origin === process.env.NEXTAUTH_URL) return true
  if (process.env.NODE_ENV !== "production") {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  }
  return false
}

/** Returns CORS headers for `req`, or null if its Origin isn't allowlisted. */
export function corsHeaders(req: NextRequest): Record<string, string> | null {
  const origin = req.headers.get("origin")
  if (!isAllowedOrigin(origin)) return null
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Requested-With",
    Vary: "Origin",
  }
}

export function withCors(req: NextRequest, res: NextResponse) {
  const headers = corsHeaders(req)
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      res.headers.set(k, v)
    }
  }
  return res
}

export function optionsCors(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) ?? {} })
}

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { optionsCors, withCors } from "@/lib/cors"

/** Applies CORS to every /api/* route from a single place, since Next's
 * static next.config headers() can't vary Access-Control-Allow-Origin per
 * request the way an allowlist requires. */
export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return optionsCors(req)
  }
  return withCors(req, NextResponse.next())
}

export const config = {
  matcher: "/api/:path*",
}

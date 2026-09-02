import { withAuth } from "next-auth/middleware"
import type { NextRequestWithAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import type { NextFetchEvent, NextRequest } from "next/server"
import type { Role } from "@prisma/client"
import { optionsCors, withCors } from "@/lib/cors"

const authProxy = withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as Role
    const path = req.nextUrl.pathname

    // only coaches/directors can access admin
    if (path.startsWith("/admin") && role === "ATHLETE") {
      return NextResponse.redirect(new URL("/athletes", req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token, // must be logged in
    },
  }
)

/**
 * /api/* only needs CORS here — route handlers do their own auth via
 * getSession() (NextAuth cookie or mobile Bearer token), so it must not go
 * through authProxy's cookie-only, redirect-on-unauthenticated logic.
 */
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    if (req.method === "OPTIONS") return optionsCors(req)
    return withCors(req, NextResponse.next())
  }
  return authProxy(req as NextRequestWithAuth, event)
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/athletes/:path*",
    "/relays/:path*",
    "/api/:path*",
  ],
}

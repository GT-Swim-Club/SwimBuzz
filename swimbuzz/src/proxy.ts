import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import type { Role } from "@prisma/client"

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as Role
    const path = req.nextUrl.pathname

    // only coaches/directors can access admin
    if (path.startsWith("/admin") && role === "ATHLETE") {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token, // must be logged in
    },
  }
)

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/athletes/:path*", "/relays/:path*"],
}
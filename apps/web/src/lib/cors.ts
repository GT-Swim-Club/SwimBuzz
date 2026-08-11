import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** Allow React Native / Expo (and local web) to call /api from other origins. */
export function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*"
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Requested-With",
  }
}

export function withCors(req: NextRequest, res: NextResponse) {
  const headers = corsHeaders(req)
  for (const [k, v] of Object.entries(headers)) {
    res.headers.set(k, v)
  }
  return res
}

export function optionsCors(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

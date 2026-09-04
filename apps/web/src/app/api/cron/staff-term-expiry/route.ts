import { NextResponse } from "next/server"
import { requireCronSecret } from "@/lib/auth/cron-auth"
import { demoteLapsedStaff } from "@/lib/auth/staff-term-expiry"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied
  try {
    return NextResponse.json({ ok: true as const, ...(await demoteLapsedStaff()) })
  } catch (err) {
    console.error("[cron/staff-term-expiry]", err)
    return NextResponse.json({ error: "Staff term expiry failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}

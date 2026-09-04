import { NextResponse } from "next/server"
import { requireCronSecret } from "@/lib/auth/cron-auth"
import { checkSignupStatus } from "@/lib/notifications/signup-monitor"

export const runtime = "nodejs"
export const maxDuration = 60

async function run() {
  const result = await checkSignupStatus()
  return { ok: true as const, ...result }
}

export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied
  try {
    return NextResponse.json(await run())
  } catch (err) {
    console.error("[cron/signup-monitor]", err)
    return NextResponse.json({ error: "Signup monitor failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}

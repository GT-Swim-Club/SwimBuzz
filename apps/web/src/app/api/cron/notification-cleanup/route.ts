import { NextResponse } from "next/server"
import { requireCronSecret } from "@/lib/cron-auth"
import {
  cleanupOldNotifications,
  cleanupOldScraperJobs,
} from "@/lib/notification-cleanup"

export const runtime = "nodejs"
export const maxDuration = 60

async function run() {
  const notifications = await cleanupOldNotifications()
  const scraperJobs = await cleanupOldScraperJobs()
  return { ok: true as const, notifications, scraperJobs }
}

export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied
  try {
    return NextResponse.json(await run())
  } catch (err) {
    console.error("[cron/notification-cleanup]", err)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}

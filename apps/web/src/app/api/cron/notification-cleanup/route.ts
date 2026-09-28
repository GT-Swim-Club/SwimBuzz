import { purgeRecentlyDeleted } from "@/lib/recovery/recovery"
import { NextResponse } from "next/server"
import { requireCronSecret } from "@/lib/auth/cron-auth"
import {
  cleanupOldNotifications,
  cleanupOldScraperJobs,
} from "@/lib/notifications/notification-cleanup"

export const runtime = "nodejs"
export const maxDuration = 60

async function run() {
  const notifications = await cleanupOldNotifications()
  const scraperJobs = await cleanupOldScraperJobs()
  const recovery = await purgeRecentlyDeleted()
  return { ok: recovery.failedMeets === 0, notifications, scraperJobs, recovery }
}

export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied
  try {
    const result = await run()
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (err) {
    console.error("[cron/notification-cleanup]", err)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}

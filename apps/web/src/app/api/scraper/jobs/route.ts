import { NextResponse } from "next/server"
import { listResumableScraperJobs } from "@/lib/scraper/scraper"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export const runtime = "nodejs"

/** In-progress and unsaved scraper jobs so a reloaded page can bring the toast back. */
export async function GET() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const jobs = await listResumableScraperJobs(session.user.id)
  return NextResponse.json({ jobs })
}

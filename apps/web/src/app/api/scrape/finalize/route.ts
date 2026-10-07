import { NextResponse } from "next/server"
import { applyAthleteScrapeJob } from "../route"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { jobId } = await req.json().catch(() => ({}))
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 })
  }

  try {
    const summary = await applyAthleteScrapeJob(jobId, session.user.id)
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Finalize failed"
    const status = message === "Job not found" ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

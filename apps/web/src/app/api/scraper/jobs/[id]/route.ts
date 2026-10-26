import { NextResponse } from "next/server"
import { ScraperJobStatus } from "@prisma/client"
import { failLostScraperJobs, getScraperJobForUser, namedRunningProgress } from "@/lib/scraper/scraper"
import { describePartialTimesSync } from "@/lib/swim/times-sync-partial"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  await failLostScraperJobs(session.user.id, id)
  const job = await getScraperJobForUser(id, session.user.id)
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  // Tell the user what a failed bulk import still managed to save.
  const savedNote =
    job.status === ScraperJobStatus.FAILED ? describePartialTimesSync(job.applyContext) : null

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    error: job.error && savedNote ? `${job.error} ${savedNote}` : job.error,
    progress:
      job.status === ScraperJobStatus.RUNNING
        ? await namedRunningProgress(job.status, job.result, job.applyContext)
        : undefined,
    result: job.status === ScraperJobStatus.COMPLETED ? job.result : undefined,
    appliedAt: job.appliedAt?.toISOString() ?? null,
    applyResult: job.applyResult ?? null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  })
}

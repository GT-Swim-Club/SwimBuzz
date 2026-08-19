import { NextResponse } from "next/server"
import { ScraperJobStatus } from "@prisma/client"
import { getScraperJobForUser } from "@/lib/scraper"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"

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
  const job = await getScraperJobForUser(id, session.user.id)
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    error: job.error,
    result: job.status === ScraperJobStatus.COMPLETED ? job.result : undefined,
    appliedAt: job.appliedAt?.toISOString() ?? null,
    applyResult: job.applyResult ?? null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  })
}

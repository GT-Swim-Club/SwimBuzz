import { NextResponse } from "next/server"
import {
  PRACTICE_EDIT_LOCK_TOKEN_HEADER,
  PracticeEditLockError,
  acquirePracticeEditLock,
  heartbeatPracticeEditLock,
  releasePracticeEditLock,
  serializePracticeEditLock } from "@/lib/practice/practice-edit-lock"
import { waitForPracticeEditLockChange } from "@/lib/practice/practice-edit-lock-watch"
import { isPracticeEditLockYieldRequested } from "@/lib/practice/practice-edit-lock-yield"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export const runtime = "nodejs"
export const maxDuration = 30

async function requireStaff() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return null
  }
  return session
}

function lockTokenFrom(req: Request, body?: { token?: unknown }): string | null {
  const header = req.headers.get(PRACTICE_EDIT_LOCK_TOKEN_HEADER)?.trim()
  if (header) return header
  if (typeof body?.token === "string" && body.token.trim()) return body.token.trim()
  return null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStaff()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const url = new URL(req.url)
  const watch = url.searchParams.get("watch") === "1"
  const clientRev = url.searchParams.get("rev")

  async function loadPracticeLock() {
    return prisma.practice.findUnique({
      where: { id },
      select: {
        editLockedById: true,
        editLockedAt: true,
        editLockExpiresAt: true,
        editLockToken: true,
        editLockedBy: { select: { id: true, name: true } }}})
  }

  let practice = await loadPracticeLock()
  if (!practice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let info = serializePracticeEditLock(practice, session.user.id)
  const yieldRequested = isPracticeEditLockYieldRequested(id)
  if (yieldRequested) {
    return NextResponse.json({ ...info, yieldRequested: true })
  }
  if (watch && clientRev && clientRev === info.rev) {
    await waitForPracticeEditLockChange(id)
    if (req.signal.aborted) {
      return new NextResponse(null, { status: 499 })
    }
    practice = await loadPracticeLock()
    if (!practice) return NextResponse.json({ error: "Not found" }, { status: 404 })
    info = serializePracticeEditLock(practice, session.user.id)
  }

  return NextResponse.json({
    ...info,
    yieldRequested: isPracticeEditLockYieldRequested(id),
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStaff()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const force = Boolean(body?.force)

  try {
    const lock = await acquirePracticeEditLock(id, session.user.id, { force })
    return NextResponse.json(lock)
  } catch (err) {
    if (err instanceof PracticeEditLockError) {
      return NextResponse.json({ error: err.message, lock: err.lock }, { status: err.status })
    }
    throw err
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStaff()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const token = lockTokenFrom(req, body)
  if (!token) {
    return NextResponse.json({ error: "Missing edit lock token" }, { status: 400 })
  }

  try {
    const lock = await heartbeatPracticeEditLock(id, session.user.id, token)
    return NextResponse.json(lock)
  } catch (err) {
    if (err instanceof PracticeEditLockError) {
      return NextResponse.json({ error: err.message, lock: err.lock }, { status: err.status })
    }
    throw err
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStaff()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const token = lockTokenFrom(req)
  await releasePracticeEditLock(id, session.user.id, token)
  return NextResponse.json({ ok: true })
}

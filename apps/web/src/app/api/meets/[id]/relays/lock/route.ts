import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import {
  RelayEditLockError,
  acquireRelayEditLock,
  heartbeatRelayEditLock,
  listRelayEditLocks,
  releaseRelayEditLock,
} from "@/lib/meet/relay-edit-lock"
import { RELAY_EDIT_LOCK_TOKEN_HEADER } from "@/lib/meet/relay-edit-lock-shared"

export const runtime = "nodejs"
// A takeover waits up to RELAY_EDIT_LOCK_YIELD_TIMEOUT_MS for the holder to save and release.
export const maxDuration = 30

/** Relay slot slugs look like "men-200-medley-relay". */
const SLOT_PATTERN = /^[a-z0-9-]{1,80}$/

async function requireStaff(id: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const
  }
  const meet = await prisma.meet.findUnique({ where: { id }, select: { id: true } })
  if (!meet) return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const
  return { userId: session.user.id } as const
}

function slotFrom(value: unknown): string | null {
  return typeof value === "string" && SLOT_PATTERN.test(value) ? value : null
}

function lockErrorResponse(err: unknown) {
  if (err instanceof RelayEditLockError) {
    return NextResponse.json({ error: err.message, lock: err.lock }, { status: err.status })
  }
  throw err
}

/** Who is editing which relay event at this meet. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(id)
  if ("response" in auth) return auth.response
  return NextResponse.json({ locks: await listRelayEditLocks(id, auth.userId) })
}

/** Start editing a relay event: `{ slot, force? }`. 409 with the current lock when someone else is. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(id)
  if ("response" in auth) return auth.response
  const body = (await req.json().catch(() => null)) as { slot?: unknown; force?: unknown } | null
  const slot = slotFrom(body?.slot)
  if (!slot) return NextResponse.json({ error: "Relay event is required" }, { status: 400 })
  try {
    return NextResponse.json(await acquireRelayEditLock(id, slot, auth.userId, { force: body?.force === true }))
  } catch (err) {
    return lockErrorResponse(err)
  }
}

/** Heartbeat: `{ slot, token }`. Renews the lock and says whether someone asked to take over. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(id)
  if ("response" in auth) return auth.response
  const body = (await req.json().catch(() => null)) as { slot?: unknown; token?: unknown } | null
  const slot = slotFrom(body?.slot)
  const token = typeof body?.token === "string" ? body.token : null
  if (!slot || !token) return NextResponse.json({ error: "Relay event and token are required" }, { status: 400 })
  try {
    return NextResponse.json(await heartbeatRelayEditLock(id, slot, auth.userId, token))
  } catch (err) {
    return lockErrorResponse(err)
  }
}

/** Stop editing: `?slot=` with the session token header. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(id)
  if ("response" in auth) return auth.response
  const slot = slotFrom(new URL(req.url).searchParams.get("slot"))
  if (!slot) return NextResponse.json({ error: "Relay event is required" }, { status: 400 })
  await releaseRelayEditLock(id, slot, auth.userId, req.headers.get(RELAY_EDIT_LOCK_TOKEN_HEADER))
  return NextResponse.json({ ok: true })
}

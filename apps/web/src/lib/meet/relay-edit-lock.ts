import { randomUUID } from "crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  canonicalRelayEvent,
  relayGenderLabel,
  relaySlotSlug,
  type RelayGenderCode,
} from "@/lib/meet/relay-builder"
import {
  RELAY_EDIT_LOCK_TTL_MS,
  RELAY_EDIT_LOCK_YIELD_TIMEOUT_MS,
  relayEditLockHolderName,
  type RelayEditLockInfo,
} from "@/lib/meet/relay-edit-lock-shared"

const HOLDER_SELECT = { select: { id: true, name: true } } as const

type LockRow = {
  slot: string
  userId: string
  token: string
  expiresAt: Date
  user: { id: string; name: string | null }
  yieldRequestedBy?: { id: string; name: string | null } | null
}

export class RelayEditLockError extends Error {
  status: number
  lock: RelayEditLockInfo

  constructor(message: string, status: number, lock: RelayEditLockInfo) {
    super(message)
    this.name = "RelayEditLockError"
    this.status = status
    this.lock = lock
  }
}

function unlocked(slot: string): RelayEditLockInfo {
  return { slot, locked: false, lockedByMe: false, lockedBy: null, expiresAt: null, token: null }
}

function isActive(row: Pick<LockRow, "expiresAt">, now = new Date()): boolean {
  return row.expiresAt.getTime() > now.getTime()
}

function serialize(row: LockRow, userId: string, opts: { includeToken?: boolean } = {}): RelayEditLockInfo {
  return {
    slot: row.slot,
    locked: true,
    lockedByMe: row.userId === userId,
    lockedBy: { id: row.user.id, name: row.user.name },
    expiresAt: row.expiresAt.toISOString(),
    token: opts.includeToken ? row.token : null,
    yieldRequested: row.yieldRequestedBy != null,
    yieldRequestedBy: row.yieldRequestedBy ?? null,
  }
}

function conflictMessage(lock: RelayEditLockInfo, what = "this relay"): string {
  if (lock.lockedByMe) return `You're already editing ${what} in another tab`
  return `${relayEditLockHolderName(lock)} is editing ${what}`
}

function lockExpiry(from = new Date()): Date {
  return new Date(from.getTime() + RELAY_EDIT_LOCK_TTL_MS)
}

async function loadLock(meetId: string, slot: string): Promise<LockRow | null> {
  return prisma.relayEditLock.findUnique({
    where: { meetId_slot: { meetId, slot } },
    select: {
      slot: true,
      userId: true,
      token: true,
      expiresAt: true,
      user: HOLDER_SELECT,
      yieldRequestedBy: HOLDER_SELECT,
    },
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Active relay edit locks for a meet — who is editing which event, for the relays summary. */
export async function listRelayEditLocks(meetId: string, userId: string): Promise<RelayEditLockInfo[]> {
  const rows = await prisma.relayEditLock.findMany({
    where: { meetId, expiresAt: { gt: new Date() } },
    select: { slot: true, userId: true, token: true, expiresAt: true, user: HOLDER_SELECT },
  })
  return rows.map((row) => serialize(row, userId))
}

/**
 * Claim a relay event for this session. An active lock (including your other tabs) needs
 * `force`, which asks the holder to save a draft and release, waits for that, then claims anyway.
 */
export async function acquireRelayEditLock(
  meetId: string,
  slot: string,
  userId: string,
  opts: { force?: boolean } = {}
): Promise<RelayEditLockInfo> {
  // Only a takeover needs the current lock up front; a plain claim just tries to create it.
  const existing = opts.force ? await loadLock(meetId, slot) : null
  if (existing && isActive(existing)) {

    // Stored on the row (not in memory) so the holder's heartbeat sees it on any server instance.
    await prisma.relayEditLock.updateMany({
      where: { meetId, slot, token: existing.token },
      data: { yieldRequestedById: userId, yieldRequestedAt: new Date() },
    })
    const deadline = Date.now() + RELAY_EDIT_LOCK_YIELD_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(Math.min(750, Math.max(0, deadline - Date.now())))
      const latest = await loadLock(meetId, slot)
      if (!latest || !isActive(latest) || latest.token !== existing.token) break
    }
  }

  const now = new Date()
  const token = randomUUID()
  const data = {
    userId,
    token,
    lockedAt: now,
    expiresAt: lockExpiry(now),
    yieldRequestedById: null,
    yieldRequestedAt: null,
  }
  if (opts.force) {
    await prisma.relayEditLock.upsert({
      where: { meetId_slot: { meetId, slot } },
      create: { meetId, slot, ...data },
      update: data,
    })
  } else {
    // An expired lock is free; a create that races another session's loses on the unique key.
    await prisma.relayEditLock.deleteMany({ where: { meetId, slot, expiresAt: { lte: now } } })
    try {
      await prisma.relayEditLock.create({ data: { meetId, slot, ...data } })
    } catch (err) {
      // No such meet.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new RelayEditLockError("Not found", 404, unlocked(slot))
      }
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err
      const latest = await loadLock(meetId, slot)
      const info = latest ? serialize(latest, userId) : unlocked(slot)
      throw new RelayEditLockError(conflictMessage(info), 409, info)
    }
  }

  return {
    slot,
    locked: true,
    lockedByMe: true,
    lockedBy: { id: userId, name: null },
    expiresAt: data.expiresAt.toISOString(),
    token,
    yieldRequested: false,
  }
}

/** Renew this session's lock; says whether someone asked to take over. Throws 409 once it's lost. */
export async function heartbeatRelayEditLock(
  meetId: string,
  slot: string,
  userId: string,
  token: string
): Promise<RelayEditLockInfo> {
  const now = new Date()
  const renewed = await prisma.relayEditLock.updateMany({
    where: { meetId, slot, userId, token, expiresAt: { gt: now } },
    data: { expiresAt: lockExpiry(now) },
  })
  const latest = await loadLock(meetId, slot)
  if (renewed.count === 0 || !latest) {
    const info = latest && isActive(latest) ? serialize(latest, userId) : unlocked(slot)
    throw new RelayEditLockError(
      info.locked
        ? info.lockedByMe
          ? "Another one of your tabs took over editing this relay"
          : `${relayEditLockHolderName(info)} took over editing this relay`
        : "Your edit session expired",
      409,
      info
    )
  }
  return serialize(latest, userId, { includeToken: true })
}

/** Release this session's lock; another tab's or user's lock is never cleared. */
export async function releaseRelayEditLock(
  meetId: string,
  slot: string,
  userId: string,
  token: string | null | undefined
): Promise<void> {
  if (!token) return
  await prisma.relayEditLock.deleteMany({ where: { meetId, slot, userId, token } })
}

/**
 * Blocks a relay write while another session is editing that event in the builder. The builder's
 * own saves pass its session token; writes from anywhere else (the roster editor, mobile, Publish
 * all) pass none. A blank gender (legacy rows) checks the event for every gender.
 */
export async function assertCanEditRelay(
  meetId: string,
  relay: { event: string; gender?: string | null },
  userId: string,
  token?: string | null
): Promise<void> {
  const event = canonicalRelayEvent(relay.event)
  const genders: RelayGenderCode[] =
    relay.gender === "M" || relay.gender === "F" || relay.gender === "X" ? [relay.gender] : ["F", "M", "X"]
  const slots = new Map(genders.map((g) => [relaySlotSlug(g, event), `${relayGenderLabel(g)} ${event}`]))
  const rows = await prisma.relayEditLock.findMany({
    where: { meetId, slot: { in: [...slots.keys()] }, expiresAt: { gt: new Date() } },
    select: { slot: true, userId: true, token: true, expiresAt: true, user: HOLDER_SELECT },
  })
  for (const row of rows) {
    if (token && row.userId === userId && row.token === token) continue
    const info = serialize(row, userId)
    throw new RelayEditLockError(conflictMessage(info, slots.get(row.slot) ?? "this relay"), 409, info)
  }
}

/** assertCanEditRelay for route handlers: the conflict as a 409 response body, or null when clear. */
export async function relayEditConflict(
  meetId: string,
  relay: { event: string; gender?: string | null },
  userId: string,
  token?: string | null
): Promise<{ error: string; lock: RelayEditLockInfo } | null> {
  try {
    await assertCanEditRelay(meetId, relay, userId, token)
    return null
  } catch (err) {
    if (err instanceof RelayEditLockError) return { error: err.message, lock: err.lock }
    throw err
  }
}

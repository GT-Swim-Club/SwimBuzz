import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import {
  PRACTICE_EDIT_LOCK_TTL_MS,
  PRACTICE_EDIT_LOCK_YIELD_TIMEOUT_MS,
  type PracticeEditLockHolder,
  type PracticeEditLockInfo,
} from "@/lib/practice-edit-lock-shared"
import { notifyPracticeEditLockChanged, waitForPracticeEditLockChange } from "@/lib/practice-edit-lock-watch"
import {
  clearPracticeEditLockYield,
  isPracticeEditLockYieldRequested,
  requestPracticeEditLockYield,
} from "@/lib/practice-edit-lock-yield"

export {
  PRACTICE_EDIT_LOCK_TTL_MS,
  PRACTICE_EDIT_LOCK_HEARTBEAT_MS,
  PRACTICE_EDIT_LOCK_POLL_MS,
  PRACTICE_EDIT_LOCK_WATCH_TIMEOUT_MS,
  PRACTICE_EDIT_LOCK_YIELD_TIMEOUT_MS,
  PRACTICE_EDIT_LOCK_TOKEN_HEADER,
  type PracticeEditLockHolder,
  type PracticeEditLockInfo,
} from "@/lib/practice-edit-lock-shared"

type LockFields = {
  editLockedById: string | null
  editLockedAt: Date | null
  editLockExpiresAt: Date | null
  editLockToken?: string | null
  editLockedBy?: PracticeEditLockHolder | null
}

export function isPracticeEditLockActive(
  practice: Pick<LockFields, "editLockedById" | "editLockExpiresAt">,
  now = new Date()
): boolean {
  return (
    !!practice.editLockedById &&
    !!practice.editLockExpiresAt &&
    practice.editLockExpiresAt.getTime() > now.getTime()
  )
}

export function practiceEditLockRevision(
  practice: Pick<LockFields, "editLockedById" | "editLockExpiresAt" | "editLockToken">,
  now = new Date()
): string {
  if (!isPracticeEditLockActive(practice, now)) return "unlocked"
  return `${practice.editLockedById}:${practice.editLockToken ?? ""}`
}

export function serializePracticeEditLock(
  practice: LockFields,
  userId: string,
  now = new Date(),
  opts: { includeToken?: boolean } = {}
): PracticeEditLockInfo {
  const active = isPracticeEditLockActive(practice, now)
  if (!active || !practice.editLockedById) {
    return {
      locked: false,
      lockedByMe: false,
      lockedBy: null,
      expiresAt: null,
      token: null,
      rev: "unlocked",
    }
  }
  return {
    locked: true,
    lockedByMe: practice.editLockedById === userId,
    lockedBy: practice.editLockedBy
      ? { id: practice.editLockedBy.id, name: practice.editLockedBy.name }
      : { id: practice.editLockedById, name: null },
    expiresAt: practice.editLockExpiresAt?.toISOString() ?? null,
    token: opts.includeToken ? practice.editLockToken ?? null : null,
    rev: practiceEditLockRevision(practice, now),
  }
}

function lockExpiry(from = new Date()): Date {
  return new Date(from.getTime() + PRACTICE_EDIT_LOCK_TTL_MS)
}

function conflictMessage(info: PracticeEditLockInfo): string {
  if (info.lockedByMe) {
    return "You're already editing this practice in another tab"
  }
  const name = info.lockedBy?.name?.trim() || "Another coach"
  return `${name} is currently editing this practice`
}

async function loadLock(practiceId: string) {
  return prisma.practice.findUnique({
    where: { id: practiceId },
    select: {
      id: true,
      editLockedById: true,
      editLockedAt: true,
      editLockExpiresAt: true,
      editLockToken: true,
      editLockedBy: { select: { id: true, name: true } },
    },
  })
}

export class PracticeEditLockError extends Error {
  status: number
  lock: PracticeEditLockInfo

  constructor(message: string, status: number, lock: PracticeEditLockInfo) {
    super(message)
    this.name = "PracticeEditLockError"
    this.status = status
    this.lock = lock
  }
}

/** Claim a new edit session. Active locks (including your other tabs) require force. */
export async function acquirePracticeEditLock(
  practiceId: string,
  userId: string,
  opts: { force?: boolean } = {}
): Promise<PracticeEditLockInfo> {
  const now = new Date()
  const existing = await loadLock(practiceId)
  if (!existing) {
    throw new PracticeEditLockError("Not found", 404, {
      locked: false,
      lockedByMe: false,
      lockedBy: null,
      expiresAt: null,
      token: null,
    })
  }

  const info = serializePracticeEditLock(existing, userId, now)
  if (info.locked && !opts.force) {
    throw new PracticeEditLockError(conflictMessage(info), 409, info)
  }

  if (info.locked && opts.force) {
    requestPracticeEditLockYield(practiceId)
    notifyPracticeEditLockChanged(practiceId)
    const deadline = Date.now() + PRACTICE_EDIT_LOCK_YIELD_TIMEOUT_MS
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      await waitForPracticeEditLockChange(practiceId, Math.min(1500, remaining))
      const latest = await loadLock(practiceId)
      if (!latest) {
        clearPracticeEditLockYield(practiceId)
        throw new PracticeEditLockError("Not found", 404, {
          locked: false,
          lockedByMe: false,
          lockedBy: null,
          expiresAt: null,
          token: null,
        })
      }
      if (!isPracticeEditLockActive(latest)) break
    }
  }

  const expiresAt = lockExpiry(now)
  const token = randomUUID()
  const data = {
    editLockedById: userId,
    editLockedAt: now,
    editLockExpiresAt: expiresAt,
    editLockToken: token,
  }

  if (opts.force) {
    await prisma.practice.update({ where: { id: practiceId }, data })
  } else {
    const claimed = await prisma.practice.updateMany({
      where: {
        id: practiceId,
        OR: [
          { editLockedById: null },
          { editLockExpiresAt: null },
          { editLockExpiresAt: { lte: now } },
        ],
      },
      data,
    })
    if (claimed.count === 0) {
      const latest = await loadLock(practiceId)
      const latestInfo = latest ? serializePracticeEditLock(latest, userId) : info
      throw new PracticeEditLockError(conflictMessage(latestInfo), 409, latestInfo)
    }
  }

  notifyPracticeEditLockChanged(practiceId)
  clearPracticeEditLockYield(practiceId)

  return {
    locked: true,
    lockedByMe: true,
    lockedBy: { id: userId, name: null },
    expiresAt: expiresAt.toISOString(),
    token,
    rev: practiceEditLockRevision({
      editLockedById: userId,
      editLockExpiresAt: expiresAt,
      editLockToken: token,
    }),
  }
}

export async function heartbeatPracticeEditLock(
  practiceId: string,
  userId: string,
  token: string
): Promise<PracticeEditLockInfo> {
  const now = new Date()
  const expiresAt = lockExpiry(now)
  const updated = await prisma.practice.updateMany({
    where: {
      id: practiceId,
      editLockedById: userId,
      editLockToken: token,
      editLockExpiresAt: { gt: now },
    },
    data: { editLockExpiresAt: expiresAt },
  })
  if (updated.count === 0) {
    const existing = await loadLock(practiceId)
    if (!existing) {
      throw new PracticeEditLockError("Not found", 404, {
        locked: false,
        lockedByMe: false,
        lockedBy: null,
        expiresAt: null,
        token: null,
      })
    }
    const info = serializePracticeEditLock(existing, userId, now)
    throw new PracticeEditLockError(
      info.locked
        ? info.lockedByMe
          ? "This tab lost the edit lock — another tab took over"
          : "Someone else took over editing"
        : "Your session expired — click Edit again to continue",
      409,
      info
    )
  }
  return {
    locked: true,
    lockedByMe: true,
    lockedBy: { id: userId, name: null },
    expiresAt: expiresAt.toISOString(),
    token,
    yieldRequested: isPracticeEditLockYieldRequested(practiceId),
  }
}

export async function releasePracticeEditLock(
  practiceId: string,
  userId: string,
  token?: string | null
): Promise<void> {
  // Require the session token so one tab cannot clear another tab's lock.
  if (!token) return
  const released = await prisma.practice.updateMany({
    where: {
      id: practiceId,
      editLockedById: userId,
      editLockToken: token,
    },
    data: {
      editLockedById: null,
      editLockedAt: null,
      editLockExpiresAt: null,
      editLockToken: null,
    },
  })
  if (released.count > 0) {
    notifyPracticeEditLockChanged(practiceId)
  }
}

/**
 * Blocks mutating while an active edit lock is held by another session.
 * Editor saves must pass the session token; unlocked practices may still be
 * published/deleted from the detail view.
 */
export async function assertCanMutatePractice(
  practiceId: string,
  userId: string,
  token?: string | null
): Promise<void> {
  const existing = await loadLock(practiceId)
  if (!existing) {
    throw new PracticeEditLockError("Not found", 404, {
      locked: false,
      lockedByMe: false,
      lockedBy: null,
      expiresAt: null,
      token: null,
    })
  }
  const info = serializePracticeEditLock(existing, userId)
  if (!info.locked) return

  if (token && existing.editLockedById === userId && existing.editLockToken === token) {
    return
  }

  throw new PracticeEditLockError(conflictMessage(info), 409, info)
}

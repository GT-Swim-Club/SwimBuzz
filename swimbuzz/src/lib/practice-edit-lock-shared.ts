/** Lock expires this long after the last heartbeat; cleared if editing tab stops sending them. */
export const PRACTICE_EDIT_LOCK_TTL_MS = 30 * 1000
/** How often the editing tab renews its lock and checks it still owns the session. */
export const PRACTICE_EDIT_LOCK_HEARTBEAT_MS = 5 * 1000
/** How often non-editing viewers poll for lock status changes. */
export const PRACTICE_EDIT_LOCK_POLL_MS = 5 * 1000
/** Long-poll timeout before re-checking lock status (matches scraper long-poll window). */
export const PRACTICE_EDIT_LOCK_WATCH_TIMEOUT_MS = 25 * 1000

export const PRACTICE_EDIT_LOCK_TOKEN_HEADER = "x-practice-edit-lock-token"

export type PracticeEditLockHolder = {
  id: string
  name: string | null
}

export type PracticeEditLockInfo = {
  locked: boolean
  lockedByMe: boolean
  lockedBy: PracticeEditLockHolder | null
  expiresAt: string | null
  /** Present only for the session that currently holds the lock. */
  token?: string | null
  /** Revision token for long-poll watching. */
  rev?: string
}

/** Lock expires this long after the last heartbeat; cleared if the builder tab stops sending them. */
export const RELAY_EDIT_LOCK_TTL_MS = 30 * 1000
/** How often the builder renews its lock and checks whether someone asked to take over. */
export const RELAY_EDIT_LOCK_HEARTBEAT_MS = 5 * 1000
/** How often the relays summary refreshes who is editing which event. */
export const RELAY_EDIT_LOCK_POLL_MS = 5 * 1000
/** How long a takeover waits for the current editor to save a draft and release. */
export const RELAY_EDIT_LOCK_YIELD_TIMEOUT_MS = 10 * 1000
/** End the edit session if the coach makes no lineup or settings change for this long. */
export const RELAY_EDIT_IDLE_TIMEOUT_MS = 10 * 60 * 1000

export const RELAY_EDIT_LOCK_TOKEN_HEADER = "x-relay-edit-lock-token"

export type RelayEditLockHolder = {
  id: string
  name: string | null
}

/** One relay event's edit lock, as seen by the current user. */
export type RelayEditLockInfo = {
  /** Relay slot slug, e.g. "men-200-medley-relay". */
  slot: string
  locked: boolean
  lockedByMe: boolean
  lockedBy: RelayEditLockHolder | null
  expiresAt: string | null
  /** Present only for the session that holds the lock. */
  token?: string | null
  /** True when another session asked this holder to save a draft and release. */
  yieldRequested?: boolean
  /** Who asked to take over, when `yieldRequested`. */
  yieldRequestedBy?: RelayEditLockHolder | null
}

/** "Jane Doe is editing" / "Another coach is editing" — the holder's name for messages. */
export function relayEditLockHolderName(lock: Pick<RelayEditLockInfo, "lockedBy"> | null | undefined): string {
  return lock?.lockedBy?.name?.trim() || "Another coach"
}

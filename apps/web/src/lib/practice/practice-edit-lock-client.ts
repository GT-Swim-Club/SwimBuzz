import type { PracticeEditLockInfo } from "@/lib/practice/practice-edit-lock-shared"

const PRACTICE_EDIT_LOCK_HANDOFF_PREFIX = "swimbuzz-practice-edit-lock-handoff:"

function handoffKey(practiceId: string) {
  return PRACTICE_EDIT_LOCK_HANDOFF_PREFIX + practiceId
}

/** Pass a claimed edit lock to the dedicated editor route within the same tab. */
export function storePracticeEditLockHandoff(
  practiceId: string,
  lock: PracticeEditLockInfo
) {
  if (typeof window === "undefined" || !lock.token) return
  try {
    sessionStorage.setItem(handoffKey(practiceId), JSON.stringify(lock))
  } catch {
    // Ignore unavailable browser storage; the editor route will acquire normally.
  }
}

/** Consume a claimed edit lock so the editor does not acquire it a second time. */
export function takePracticeEditLockHandoff(
  practiceId: string
): PracticeEditLockInfo | null {
  if (typeof window === "undefined") return null
  try {
    const key = handoffKey(practiceId)
    const raw = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    if (!raw) return null
    const lock = JSON.parse(raw) as PracticeEditLockInfo
    const expiresAt = lock.expiresAt ? new Date(lock.expiresAt).getTime() : NaN
    if (!lock.token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null
    }
    return lock
  } catch {
    return null
  }
}

/** Tell other tabs viewing the same practice to refresh lock status immediately. */
export function broadcastPracticeEditLockChanged(practiceId: string) {
  if (typeof BroadcastChannel === "undefined") return
  try {
    new BroadcastChannel(`swimbuzz-practice-lock:${practiceId}`).postMessage(null)
  } catch {
    // ignore unsupported environments
  }
}

/** Ask the tab that currently holds the lock to save and release. */
export function broadcastPracticeEditLockYield(practiceId: string) {
  if (typeof BroadcastChannel === "undefined") return
  try {
    new BroadcastChannel(`swimbuzz-practice-lock:${practiceId}`).postMessage({ type: "yield" })
  } catch {
    // ignore unsupported environments
  }
}

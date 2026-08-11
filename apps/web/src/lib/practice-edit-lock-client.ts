/** Tell other tabs viewing the same practice to refresh lock status immediately. */
export function broadcastPracticeEditLockChanged(practiceId: string) {
  if (typeof BroadcastChannel === "undefined") return
  try {
    new BroadcastChannel(`swimbuzz-practice-lock:${practiceId}`).postMessage(null)
  } catch {
    // ignore unsupported environments
  }
}

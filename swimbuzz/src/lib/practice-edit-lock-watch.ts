import { PRACTICE_EDIT_LOCK_WATCH_TIMEOUT_MS } from "@/lib/practice-edit-lock-shared"

type Waiter = {
  resolve: () => void
  timer: ReturnType<typeof setTimeout>
}

const globalForLockWatch = globalThis as unknown as {
  practiceEditLockWaiters?: Map<string, Set<Waiter>>
}

function waitersByPractice() {
  if (!globalForLockWatch.practiceEditLockWaiters) {
    globalForLockWatch.practiceEditLockWaiters = new Map()
  }
  return globalForLockWatch.practiceEditLockWaiters
}

/** Wake long-poll watchers when a practice edit lock is acquired or released. */
export function notifyPracticeEditLockChanged(practiceId: string) {
  const waiters = waitersByPractice().get(practiceId)
  if (!waiters?.size) return
  for (const waiter of waiters) {
    clearTimeout(waiter.timer)
    waiter.resolve()
  }
  waitersByPractice().delete(practiceId)
}

export function waitForPracticeEditLockChange(
  practiceId: string,
  timeoutMs = PRACTICE_EDIT_LOCK_WATCH_TIMEOUT_MS
): Promise<void> {
  return new Promise((resolve) => {
    const waiter: Waiter = {
      resolve,
      timer: setTimeout(resolve, timeoutMs),
    }
    const map = waitersByPractice()
    const waiters = map.get(practiceId) ?? new Set<Waiter>()
    waiters.add(waiter)
    map.set(practiceId, waiters)
  })
}

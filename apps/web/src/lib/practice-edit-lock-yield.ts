const globalForLockYield = globalThis as unknown as {
  practiceEditLockYields?: Set<string>
}

function yieldRequests() {
  if (!globalForLockYield.practiceEditLockYields) {
    globalForLockYield.practiceEditLockYields = new Set()
  }
  return globalForLockYield.practiceEditLockYields
}

export function requestPracticeEditLockYield(practiceId: string) {
  yieldRequests().add(practiceId)
}

export function clearPracticeEditLockYield(practiceId: string) {
  yieldRequests().delete(practiceId)
}

export function isPracticeEditLockYieldRequested(practiceId: string) {
  return yieldRequests().has(practiceId)
}

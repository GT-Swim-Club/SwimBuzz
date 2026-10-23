/**
 * One open tab drives a scraper job's poll and finalize. The desktop scraper
 * itself keeps running if every tab closes; the next visit takes the lock
 * once it goes stale.
 *
 * A reload keeps the same sessionStorage tab id. A generation on this document
 * stops the dying page from releasing the lock the reloaded page just claimed.
 */

const TAB_KEY = "swimbuzz-tab-id"
const LOCK_KEY = "swimbuzz-scraper-locks"
const DISMISS_KEY = "swimbuzz-dismissed-scraper-jobs"
const STALE_MS = 8000

type Lock = { tabId: string; at: number; gen: number }
type LockMap = Record<string, Lock>

let generation = 0
const held = new Set<string>()
let listening = false

function tabId(): string {
  let id = sessionStorage.getItem(TAB_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(TAB_KEY, id)
  }
  return id
}

function readLocks(): LockMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCK_KEY) ?? "{}") as LockMap
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocks(map: LockMap) {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(map))
  } catch {
    // A full quota shouldn't stop the import.
  }
}

function ensureWatching() {
  if (listening || typeof window === "undefined") return
  listening = true
  window.setInterval(() => {
    if (generation < 0 || held.size === 0) return
    const map = readLocks()
    const me = tabId()
    let changed = false
    for (const id of held) {
      const existing = map[id]
      if (existing?.tabId === me && existing.gen === generation) {
        map[id] = { tabId: me, at: Date.now(), gen: generation }
        changed = true
      }
    }
    if (changed) writeLocks(map)
  }, 3000)
  window.addEventListener("pagehide", () => {
    const gen = generation
    generation = -1
    const map = readLocks()
    const me = tabId()
    let changed = false
    for (const [id, lock] of Object.entries(map)) {
      if (lock.tabId === me && lock.gen === gen) {
        map[id] = { ...lock, at: 0 }
        changed = true
      }
    }
    if (changed) writeLocks(map)
  })
}

/** True when another live tab is already polling this job. */
export function scraperJobBusyElsewhere(jobId: string): boolean {
  if (typeof window === "undefined") return false
  const existing = readLocks()[jobId]
  if (!existing || existing.tabId === tabId()) return false
  return Date.now() - existing.at < STALE_MS
}

/**
 * Claim a job for this tab. `force` is for the tab that just enqueued it
 * (or is following a roster chain) so a resume in another tab steps aside.
 */
export function holdScraperJob(jobId: string, force = false): boolean {
  if (typeof window === "undefined") return false
  if (generation < 0) return false
  const map = readLocks()
  const existing = map[jobId]
  const me = tabId()
  const ownedByOther =
    !!existing && existing.tabId !== me && Date.now() - existing.at < STALE_MS
  if (ownedByOther && !force) return false
  map[jobId] = { tabId: me, at: Date.now(), gen: generation }
  held.add(jobId)
  writeLocks(map)
  ensureWatching()
  return true
}

export function unholdScraperJob(jobId: string) {
  if (typeof window === "undefined") return
  held.delete(jobId)
  const map = readLocks()
  const existing = map[jobId]
  if (existing && existing.tabId === tabId() && existing.gen === generation) {
    delete map[jobId]
    writeLocks(map)
  }
}

export function isScraperJobDismissed(jobId: string): boolean {
  if (typeof window === "undefined") return false
  return readDismissed().includes(jobId)
}

export function rememberDismissedScraperJob(jobId: string) {
  if (typeof window === "undefined") return
  const ids = readDismissed()
  if (ids.includes(jobId)) return
  ids.push(jobId)
  localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-50)))
}

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

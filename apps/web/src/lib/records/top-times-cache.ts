import { revalidateTag } from "next/cache"

/** Tag on the cached Top 10 lists (record-top-times.ts), so a records sync can drop them. */
export const TOP_TIMES_CACHE_TAG = "team-top-times"

/**
 * Drop the cached Top 10 lists at once, so the next view is computed fresh. Called by every records
 * sync, which runs after any write that changes imported swims, relay results or athletes.
 * Outside a Next.js request (a script's sync) there's no cache to drop.
 */
export function expireTopTimesCache(): void {
  try {
    revalidateTag(TOP_TIMES_CACHE_TAG, { expire: 0 })
  } catch {
    // Not in a Next.js request.
  }
}

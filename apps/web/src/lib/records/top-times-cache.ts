import { revalidateTag } from "next/cache"
import { after } from "next/server"

/** Tag on the cached Top 10 lists (record-top-times.ts), so a records sync can drop them. */
export const TOP_TIMES_CACHE_TAG = "team-top-times"

/**
 * Drop the cached Top 10 lists at once, so the next view is computed fresh. Called by every records
 * sync, which runs after any write that changes imported swims, relay results or athletes.
 * Outside a Next.js request (a script's sync) there's no cache to drop.
 */
export function expireTopTimesCache(): void {
  const expire = () => revalidateTag(TOP_TIMES_CACHE_TAG, { expire: 0 })
  try {
    expire()
  } catch {
    // Not in a Next.js request.
    return
  }
  // Next applies a route handler's revalidations when the handler returns. A streamed import
  // (streamImport) syncs records after that, inside its response stream, so the tag above would
  // never be applied and the Top 10 would keep the meets from before the import. after() applies
  // its callback's revalidations once the response closes, whenever the sync ran.
  try {
    after(expire)
  } catch {
    // No response to wait for (e.g. a server action that has finished).
  }
}

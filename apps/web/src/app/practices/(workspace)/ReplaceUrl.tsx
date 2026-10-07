"use client"

import { useEffect } from "react"

/**
 * Swaps the address bar to `path` (keeping the current query string) without
 * a navigation. Next syncs usePathname with native history calls — but only
 * when the state passed isn't its own, hence `null`.
 */
export default function ReplaceUrl({ path }: { path: string }) {
  useEffect(() => {
    window.history.replaceState(null, "", path + window.location.search)
  }, [path])
  return null
}

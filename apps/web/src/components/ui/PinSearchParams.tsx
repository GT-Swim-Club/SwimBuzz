"use client"

import { useEffect } from "react"

/**
 * Writes `params` into the address bar's query string in place (`null`
 * deletes), keeping every other param and the hash. For pages that resolve a
 * default on the server: redirect()ing to the canonical URL instead would land
 * mid-stream and remount the loading skeleton. Next syncs useSearchParams with
 * native history calls — but only when the state passed isn't its own, hence
 * `null`.
 */
export default function PinSearchParams({ params }: { params: Record<string, string | null> }) {
  const key = JSON.stringify(params)
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    for (const [name, value] of Object.entries(JSON.parse(key) as Record<string, string | null>)) {
      if (value === null) search.delete(name)
      else search.set(name, value)
    }
    const next = `?${search.toString()}`
    if (next === window.location.search) return
    window.history.replaceState(null, "", window.location.pathname + next + window.location.hash)
  }, [key])
  return null
}

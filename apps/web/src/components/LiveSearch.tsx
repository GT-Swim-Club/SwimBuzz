"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

const DEBOUNCE_MS = 400

export default function LiveSearch({
  pathname,
  placeholder,
}: {
  pathname: string
  placeholder: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlQuery = searchParams.get("q") ?? ""
  const paramsString = searchParams.toString()
  const [query, setQuery] = useState(urlQuery)
  const lastPushed = useRef(urlQuery)
  const [, startTransition] = useTransition()

  // Sync from URL on external navigation (back/forward), not our own pushes.
  useEffect(() => {
    if (urlQuery === lastPushed.current) return
    lastPushed.current = urlQuery
    setQuery(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === lastPushed.current.trim()) return

    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(paramsString)
      if (trimmed) params.set("q", trimmed)
      else params.delete("q")
      const qs = params.toString()
      lastPushed.current = trimmed
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname)
      })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(handle)
  }, [query, pathname, paramsString, router])

  return (
    <input
      type="search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
    />
  )
}

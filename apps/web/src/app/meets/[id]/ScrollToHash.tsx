"use client"

import { useEffect } from "react"

function targetIdFromHash(hash: string): string | null {
  if (!hash) return null
  const hashes = hash.split("#").filter(Boolean)
  return hashes[hashes.length - 1] || null
}

export default function ScrollToHash() {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined

    const clearTimers = () => {
      if (interval) clearInterval(interval)
      interval = undefined
    }

    const run = () => {
      clearTimers()

      const hash = window.location.hash
      const targetId = targetIdFromHash(hash)
      if (!targetId) return

      const hashes = hash.split("#").filter(Boolean)
      if (hashes.length > 1) {
        window.history.replaceState(null, "", `${window.location.pathname}#${targetId}`)
      }

      let attempts = 0
      interval = setInterval(() => {
        const el = document.getElementById(targetId)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          window.history.replaceState(null, "", window.location.pathname)
          clearTimers()
          return
        }
        attempts++
        if (attempts > 50) clearTimers()
      }, 100)
    }

    run()
    window.addEventListener("hashchange", run)
    return () => {
      clearTimers()
      window.removeEventListener("hashchange", run)
    }
  }, [])

  return null
}

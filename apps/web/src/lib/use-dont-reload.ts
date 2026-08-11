"use client"

import { useEffect } from "react"

/** Warn on tab close / refresh while a long request is in flight. */
export function useDontReloadWhileBusy(busy: boolean) {
  useEffect(() => {
    if (!busy) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [busy])
}

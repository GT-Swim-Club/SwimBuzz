"use client"

import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const LEAVE_MESSAGE = "Leave page? Changes you made may not be saved."

/**
 * Ask before leaving a page with unsaved changes, using the browser's own dialogs. Tab close,
 * reload, in-app links and `guardedNavigate` all unload the page (a full navigation while dirty),
 * so the browser shows its native "Leave site?" prompt. Back never unloads the page, so it gets
 * a native confirm instead: while dirty, a duplicate history entry sits on top for Back to pop.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter()
  const dirtyRef = useRef(dirty)
  const leavingRef = useRef(false)
  /** A guard entry is on top of the history stack. */
  const sentinelRef = useRef(false)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  /** Navigate without asking (e.g. after saving), replacing the guard entry so it doesn't linger. */
  const navigate = useCallback(
    (href: string) => {
      leavingRef.current = true
      if (sentinelRef.current) {
        sentinelRef.current = false
        router.replace(href)
      } else {
        router.push(href)
      }
    },
    [router]
  )

  /**
   * Leave on purpose without a router navigation (the caller swaps the view and updates the URL
   * itself). Returns true when the guard's history entry is on top, so the caller should replace
   * that entry rather than push a new one.
   */
  const leave = useCallback(() => {
    leavingRef.current = true
    const replace = sentinelRef.current
    sentinelRef.current = false
    return replace
  }, [])

  /** Navigate, letting the browser ask first when there are unsaved changes. */
  const guardedNavigate = useCallback(
    (href: string) => {
      if (dirtyRef.current) window.location.assign(href)
      else navigate(href)
    },
    [navigate]
  )

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  useEffect(() => {
    // Capture phase, so this runs before Next's <Link> handler and can swap in a full navigation.
    function onClick(event: MouseEvent) {
      if (!dirtyRef.current || leavingRef.current || event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      event.preventDefault()
      event.stopPropagation()
      window.location.assign(url.href)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  useEffect(() => {
    if (!dirty || sentinelRef.current) return
    window.history.pushState(null, "", window.location.href)
    sentinelRef.current = true
  }, [dirty])

  useEffect(() => {
    function onPopState() {
      if (!sentinelRef.current || leavingRef.current) return
      // Back just popped the guard entry; we're still on this page.
      sentinelRef.current = false
      if (!dirtyRef.current) {
        window.history.back()
        return
      }
      if (window.confirm(LEAVE_MESSAGE)) {
        leavingRef.current = true
        window.history.back()
        return
      }
      window.history.pushState(null, "", window.location.href)
      sentinelRef.current = true
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  return { navigate, guardedNavigate, leave }
}

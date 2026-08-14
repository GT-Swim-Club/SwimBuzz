"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  buildFullPath,
  formatBackLabel,
  isBackNavigation,
  isSameLogicalPage,
  NAV_CURR_KEY,
  NAV_CURR_LABEL_KEY,
  setBackTarget,
} from "@/lib/navigation-history"

export default function NavigationTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const current = buildFullPath(pathname, searchParams.toString())
    const stored = sessionStorage.getItem(NAV_CURR_KEY)

    if (
      stored &&
      stored !== current &&
      !isBackNavigation(stored, current) &&
      !isSameLogicalPage(stored, current)
    ) {
      const fromLabel =
        sessionStorage.getItem(NAV_CURR_LABEL_KEY) ?? formatBackLabel(stored, "Back")
      setBackTarget(current, { href: stored, label: fromLabel })
    }

    sessionStorage.setItem(NAV_CURR_KEY, current)
    sessionStorage.removeItem(NAV_CURR_LABEL_KEY)
  }, [pathname, searchParams])

  return null
}

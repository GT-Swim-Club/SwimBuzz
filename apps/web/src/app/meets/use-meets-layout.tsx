"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { saveListLayout, type ListLayout } from "@/lib/list-layout"

const MeetsLayoutContext = createContext<{ layout: ListLayout; setLayout: (layout: ListLayout) => void } | null>(null)

/**
 * Gallery/List layout for /meets, shared by the toolbar toggle and the lists
 * below it. Switching is client-side (every list already has its data); the
 * choice is saved to a cookie so the next visit opens in it.
 */
export function MeetsLayoutProvider({ initial, children }: { initial: ListLayout; children: ReactNode }) {
  const [layout, setLayoutState] = useState(initial)
  function setLayout(next: ListLayout) {
    setLayoutState(next)
    saveListLayout("meets", next)
  }
  return <MeetsLayoutContext.Provider value={{ layout, setLayout }}>{children}</MeetsLayoutContext.Provider>
}

export function useMeetsLayout() {
  const ctx = useContext(MeetsLayoutContext)
  if (!ctx) throw new Error("useMeetsLayout must be used within MeetsLayoutProvider")
  return ctx
}

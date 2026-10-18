"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { SegmentedToggle, segmentedIconOptionClass } from "@/components/ui/SegmentedToggle"
import { saveListLayout, type ListLayout, type ListLayoutPage } from "@/lib/list-layout"

const ListLayoutContext = createContext<{ layout: ListLayout; setLayout: (layout: ListLayout) => void } | null>(null)

/**
 * List/Gallery layout for a page, shared by its toolbar toggle and the lists
 * below it. Switching is client-side (every list already has its data); the
 * choice is saved to `page`'s cookie so the next visit opens in it.
 */
export function ListLayoutProvider({
  page,
  initial,
  children,
}: {
  page: ListLayoutPage
  initial: ListLayout
  children: ReactNode
}) {
  const [layout, setLayoutState] = useState(initial)
  function setLayout(next: ListLayout) {
    setLayoutState(next)
    saveListLayout(page, next)
  }
  return <ListLayoutContext.Provider value={{ layout, setLayout }}>{children}</ListLayoutContext.Provider>
}

export function useListLayout() {
  const ctx = useContext(ListLayoutContext)
  if (!ctx) throw new Error("useListLayout must be used within ListLayoutProvider")
  return ctx
}

/** List/Gallery switch for a toolbar inside ListLayoutProvider. */
export function ListLayoutToggle() {
  const { layout, setLayout } = useListLayout()
  return (
    <SegmentedToggle
      selectedIndex={layout === "list" ? 0 : 1}
      className="h-[42px] shrink-0 rounded-lg border border-border bg-background"
    >
      {(["list", "gallery"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setLayout(value)}
          aria-label={value === "list" ? "List view" : "Gallery view"}
          aria-pressed={layout === value}
          className={"group relative " + segmentedIconOptionClass(layout === value)}
        >
          <AppIcon name={value} className="h-4 w-4 shrink-0" />
          <HoverDetail label={value === "list" ? "List" : "Gallery"} />
        </button>
      ))}
    </SegmentedToggle>
  )
}

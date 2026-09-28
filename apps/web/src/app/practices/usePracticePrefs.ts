"use client"

import { useEffect, useState } from "react"

export type PracticeRailView = "week" | "list" | "deleted"
export type PracticeListSort = "date-desc" | "date-asc" | "yards-desc" | "yards-asc"
export type PracticeCardLabel = "time" | "tags"

const KEYS = {
  view: "swimbuzz-detail-view",
  monThuOnly: "swimbuzz-monThuOnly",
  sidebarOpen: "swimbuzz-detail-sidebar",
  sidebarWidth: "swimbuzz-detail-sidebar-width",
  sort: "swimbuzz-list-sort",
  cardLabel: "swimbuzz-practice-card-label",
}

// The label under a practice card's title is either its time or its tags —
// never both, since tags right-aligned alongside the time looked cluttered.
// A user's cardLabel choice picks between them, but an active tag filter
// always wins: seeing which tag(s) matched is more useful than the time
// while filtering.
export function showCardTags(
  activeTags: string[],
  practiceTags: string[],
  cardLabel: PracticeCardLabel
): boolean {
  return (activeTags.length > 0 || cardLabel === "tags") && practiceTags.length > 0
}

const DEFAULT_SIDEBAR_WIDTH = 324

function readString<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback
  } catch {
    return fallback
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === "1") return true
    if (raw === "0") return false
    return fallback
  } catch {
    return fallback
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // localStorage unavailable (private mode, blocked) — pref just won't persist
  }
}

export type PracticePrefs = {
  ready: boolean
  view: PracticeRailView
  setView: (view: PracticeRailView) => void
  monThuOnly: boolean
  setMonThuOnly: (value: boolean) => void
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  sidebarWidth: number
  setSidebarWidth: (value: number) => void
  sort: PracticeListSort
  setSort: (value: PracticeListSort) => void
  cardLabel: PracticeCardLabel
  setCardLabel: (value: PracticeCardLabel) => void
}

export function usePracticePrefs(): PracticePrefs {
  const [ready, setReady] = useState(false)
  const [view, setViewState] = useState<PracticeRailView>("week")
  const [monThuOnly, setMonThuOnlyState] = useState(false)
  const [sidebarOpen, setSidebarOpenState] = useState(true)
  const [sidebarWidth, setSidebarWidthState] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [sort, setSortState] = useState<PracticeListSort>("date-desc")
  const [cardLabel, setCardLabelState] = useState<PracticeCardLabel>("time")

  // localStorage isn't available during SSR, so these all start at their
  // defaults (matching the server-rendered output) and swap to the persisted
  // values once mounted — a real external system being read, not state
  // derivable from props/render, so the setState-per-effect pattern here is
  // intentional (see useViewerTimeZone in ZonedTime.tsx for the same
  // hydration problem solved via useSyncExternalStore instead; that approach
  // doesn't fit here since these values are also locally *written* by this
  // hook's own setters, not just read from an external source).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setViewState(readString(KEYS.view, ["week", "list", "deleted"] as const, "week"))
    setMonThuOnlyState(readBool(KEYS.monThuOnly, false))
    setSidebarOpenState(readBool(KEYS.sidebarOpen, true))
    setSidebarWidthState(readNumber(KEYS.sidebarWidth, DEFAULT_SIDEBAR_WIDTH))
    setSortState(
      readString(
        KEYS.sort,
        ["date-desc", "date-asc", "yards-desc", "yards-asc"] as const,
        "date-desc"
      )
    )
    setCardLabelState(readString(KEYS.cardLabel, ["time", "tags"] as const, "time"))
    setReady(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    ready,
    view,
    setView: (value) => {
      setViewState(value)
      write(KEYS.view, value)
    },
    monThuOnly,
    setMonThuOnly: (value) => {
      setMonThuOnlyState(value)
      write(KEYS.monThuOnly, value ? "1" : "0")
    },
    sidebarOpen,
    setSidebarOpen: (value) => {
      setSidebarOpenState(value)
      write(KEYS.sidebarOpen, value ? "1" : "0")
    },
    sidebarWidth,
    setSidebarWidth: (value) => {
      setSidebarWidthState(value)
      write(KEYS.sidebarWidth, String(value))
    },
    sort,
    setSort: (value) => {
      setSortState(value)
      write(KEYS.sort, value)
    },
    cardLabel,
    setCardLabel: (value) => {
      setCardLabelState(value)
      write(KEYS.cardLabel, value)
    },
  }
}

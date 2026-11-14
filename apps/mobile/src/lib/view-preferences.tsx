import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import type { PracticeScope } from "@swimbuzz/shared"

/**
 * Each list screen remembers the last view used on this device — like web,
 * which keeps each page's layout in a cookie. There is no default-view setting
 * any more; the old account-level `User.defaultView` / `defaultPracticesView`
 * are only read once, from the local cache older builds left behind.
 *
 * Kept under the same key as before: `clearSession()` in api.ts removes it on
 * sign-out, so the next person on the device starts from the defaults.
 */
const STORAGE_KEY = "swimbuzz.viewPreferences"

export type DefaultView = "gallery" | "list"
/** Practices tab views. "deleted" is Trash (staff only), like web's sidebar views. */
export type DefaultPracticesView = "week" | "month" | "list" | "deleted"
/** What a practice row shows under its title — web's "Card label" setting. */
export type PracticeCardLabel = "time" | "tags"
export type PracticeSort = "date-desc" | "date-asc" | "yards-desc" | "yards-asc"

/** The Practices tab's settings, mirroring the web sidebar's prefs cookie. */
export type PracticePrefs = {
  view: DefaultPracticesView
  scope: PracticeScope
  cardLabel: PracticeCardLabel
  monThuOnly: boolean
  sort: PracticeSort
}

type RememberedViews = {
  roster: DefaultView
  meets: DefaultView
  nationals: DefaultView
  practices: DefaultPracticesView
  practiceScope: PracticeScope
  practiceCardLabel: PracticeCardLabel
  practiceMonThuOnly: boolean
  practiceSort: PracticeSort
}

export type GalleryScreen = "roster" | "meets" | "nationals"

const DEFAULT_VIEWS: RememberedViews = {
  roster: "gallery",
  meets: "gallery",
  nationals: "gallery",
  practices: "week",
  practiceScope: "all",
  practiceCardLabel: "time",
  practiceMonThuOnly: false,
  practiceSort: "date-desc",
}

function galleryView(value: unknown): DefaultView | null {
  return value === "gallery" || value === "list" ? value : null
}

function practicesView(value: unknown): DefaultPracticesView | null {
  return value === "week" || value === "month" || value === "list" || value === "deleted"
    ? value
    : null
}

function practiceScope(value: unknown): PracticeScope | null {
  return value === "all" || value === "team" || value === "mine" ? value : null
}

function practiceCardLabel(value: unknown): PracticeCardLabel | null {
  return value === "time" || value === "tags" ? value : null
}

function practiceSort(value: unknown): PracticeSort | null {
  return value === "date-desc" || value === "date-asc" || value === "yards-desc" || value === "yards-asc"
    ? value
    : null
}

async function loadRememberedViews(): Promise<RememberedViews | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Older builds stored one `defaultView` for every gallery screen.
    const legacy = galleryView(parsed.defaultView)
    return {
      roster: galleryView(parsed.roster) ?? legacy ?? DEFAULT_VIEWS.roster,
      meets: galleryView(parsed.meets) ?? legacy ?? DEFAULT_VIEWS.meets,
      nationals: galleryView(parsed.nationals) ?? legacy ?? DEFAULT_VIEWS.nationals,
      practices:
        practicesView(parsed.practices) ??
        practicesView(parsed.defaultPracticesView) ??
        DEFAULT_VIEWS.practices,
      practiceScope: practiceScope(parsed.practiceScope) ?? DEFAULT_VIEWS.practiceScope,
      practiceCardLabel:
        practiceCardLabel(parsed.practiceCardLabel) ?? DEFAULT_VIEWS.practiceCardLabel,
      practiceMonThuOnly:
        typeof parsed.practiceMonThuOnly === "boolean"
          ? parsed.practiceMonThuOnly
          : DEFAULT_VIEWS.practiceMonThuOnly,
      practiceSort: practiceSort(parsed.practiceSort) ?? DEFAULT_VIEWS.practiceSort,
    }
  } catch {
    return null
  }
}

function saveRememberedViews(views: RememberedViews) {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(views)).catch(() => {})
}

type ViewPreferencesContextValue = {
  views: RememberedViews
  setView: <K extends keyof RememberedViews>(screen: K, value: RememberedViews[K]) => void
}

const ViewPreferencesContext = createContext<ViewPreferencesContextValue | null>(null)

export function ViewPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [views, setViews] = useState<RememberedViews>(DEFAULT_VIEWS)

  useEffect(() => {
    let cancelled = false
    void loadRememberedViews().then((stored) => {
      if (!cancelled && stored) setViews(stored)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setView = useCallback(
    <K extends keyof RememberedViews>(screen: K, value: RememberedViews[K]) => {
      setViews((prev) => {
        if (prev[screen] === value) return prev
        const next = { ...prev, [screen]: value }
        saveRememberedViews(next)
        return next
      })
    },
    []
  )

  const value = useMemo(() => ({ views, setView }), [views, setView])

  return (
    <ViewPreferencesContext.Provider value={value}>{children}</ViewPreferencesContext.Provider>
  )
}

function useViewPreferences() {
  const ctx = useContext(ViewPreferencesContext)
  if (!ctx) {
    throw new Error("useViewPreferences must be used within ViewPreferencesProvider")
  }
  return ctx
}

/** Gallery or list for a screen, remembered on this device. */
export function useGalleryView(
  screen: GalleryScreen
): [DefaultView, (value: DefaultView) => void] {
  const { views, setView } = useViewPreferences()
  const set = useCallback((value: DefaultView) => setView(screen, value), [screen, setView])
  return [views[screen], set]
}

export type PracticePrefsApi = PracticePrefs & {
  setView: (value: DefaultPracticesView) => void
  setScope: (value: PracticeScope) => void
  setCardLabel: (value: PracticeCardLabel) => void
  setMonThuOnly: (value: boolean) => void
  setSort: (value: PracticeSort) => void
}

/**
 * The Practices tab's view, scope, card label, Mon–Thu and sort, remembered on
 * this device. Trash ("deleted") is staff-only, so anyone else falls back to Week.
 */
export function usePracticePrefs(isStaff: boolean): PracticePrefsApi {
  const { views, setView } = useViewPreferences()
  const setPracticesView = useCallback(
    (value: DefaultPracticesView) => setView("practices", value),
    [setView]
  )
  const setScope = useCallback((value: PracticeScope) => setView("practiceScope", value), [setView])
  const setCardLabel = useCallback(
    (value: PracticeCardLabel) => setView("practiceCardLabel", value),
    [setView]
  )
  const setMonThuOnly = useCallback(
    (value: boolean) => setView("practiceMonThuOnly", value),
    [setView]
  )
  const setSort = useCallback((value: PracticeSort) => setView("practiceSort", value), [setView])
  return {
    view: views.practices === "deleted" && !isStaff ? "week" : views.practices,
    scope: views.practiceScope,
    cardLabel: views.practiceCardLabel,
    monThuOnly: views.practiceMonThuOnly,
    sort: views.practiceSort,
    setView: setPracticesView,
    setScope,
    setCardLabel,
    setMonThuOnly,
    setSort,
  }
}

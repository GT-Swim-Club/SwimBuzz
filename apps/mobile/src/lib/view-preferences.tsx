import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "./api"
import { useAuth } from "./auth"

const STORAGE_KEY = "swimbuzz.viewPreferences"

type StoredViewPreferences = {
  defaultView: DefaultView
  defaultPracticesView: DefaultPracticesView
}

async function loadStoredViewPreferences(): Promise<StoredViewPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredViewPreferences>
    return {
      defaultView: parsed.defaultView === "list" ? "list" : "gallery",
      defaultPracticesView:
        parsed.defaultPracticesView === "month" || parsed.defaultPracticesView === "list"
          ? parsed.defaultPracticesView
          : "week",
    }
  } catch {
    return null
  }
}

function saveStoredViewPreferences(prefs: StoredViewPreferences) {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {})
}

export type DefaultView = "gallery" | "list"
export type DefaultPracticesView = "week" | "month" | "list"

type ViewPreferencesContextValue = {
  defaultView: DefaultView
  defaultPracticesView: DefaultPracticesView
  setDefaultView: (value: DefaultView) => Promise<void>
  setDefaultPracticesView: (value: DefaultPracticesView) => Promise<void>
}

const ViewPreferencesContext =
  createContext<ViewPreferencesContextValue | null>(null)

export function ViewPreferencesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth()
  const [defaultView, setDefaultViewState] = useState<DefaultView>("gallery")
  const [defaultPracticesView, setDefaultPracticesViewState] =
    useState<DefaultPracticesView>("week")

  // Stale-from-disk then revalidate — seeds from AsyncStorage first so the
  // gallery/list and week/month toggles don't flash their defaults on cold
  // start, then confirms against the server (same shape as auth.tsx's
  // stored-user pattern).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void loadStoredViewPreferences().then((stored) => {
      if (cancelled || !stored) return
      setDefaultViewState(stored.defaultView)
      setDefaultPracticesViewState(stored.defaultPracticesView)
    })
    void api
      .getViewPreference()
      .then((prefs) => {
        if (cancelled) return
        const nextView = prefs.defaultView === "list" ? "list" : "gallery"
        const nextPracticesView =
          prefs.defaultPracticesView === "month" ||
            prefs.defaultPracticesView === "list"
            ? prefs.defaultPracticesView
            : "week"
        setDefaultViewState(nextView)
        setDefaultPracticesViewState(nextPracticesView)
        saveStoredViewPreferences({
          defaultView: nextView,
          defaultPracticesView: nextPracticesView,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  const setDefaultView = useCallback(async (value: DefaultView) => {
    const previous = defaultView
    setDefaultViewState(value)
    try {
      const res = await api.updateViewPreference({ defaultView: value })
      const next = res.defaultView === "list" ? "list" : "gallery"
      setDefaultViewState(next)
      saveStoredViewPreferences({ defaultView: next, defaultPracticesView })
    } catch (err) {
      setDefaultViewState(previous)
      throw err
    }
  }, [defaultView, defaultPracticesView])

  const setDefaultPracticesView = useCallback(
    async (value: DefaultPracticesView) => {
      const previous = defaultPracticesView
      setDefaultPracticesViewState(value)
      try {
        const res = await api.updateViewPreference({
          defaultPracticesView: value,
        })
        const next =
          res.defaultPracticesView === "month" ||
            res.defaultPracticesView === "list"
            ? res.defaultPracticesView
            : "week"
        setDefaultPracticesViewState(next)
        saveStoredViewPreferences({ defaultView, defaultPracticesView: next })
      } catch (err) {
        setDefaultPracticesViewState(previous)
        throw err
      }
    },
    [defaultView, defaultPracticesView]
  )

  const value = useMemo(
    () => ({
      defaultView,
      defaultPracticesView,
      setDefaultView,
      setDefaultPracticesView,
    }),
    [defaultView, defaultPracticesView, setDefaultView, setDefaultPracticesView]
  )

  return (
    <ViewPreferencesContext.Provider value={value}>
      {children}
    </ViewPreferencesContext.Provider>
  )
}

export function useViewPreferences() {
  const ctx = useContext(ViewPreferencesContext)
  if (!ctx) {
    throw new Error(
      "useViewPreferences must be used within ViewPreferencesProvider"
    )
  }
  return ctx
}

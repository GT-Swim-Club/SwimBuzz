import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { api } from "./api"
import { useAuth } from "./auth"

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

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void api
      .getViewPreference()
      .then((prefs) => {
        if (cancelled) return
        setDefaultViewState(prefs.defaultView === "list" ? "list" : "gallery")
        setDefaultPracticesViewState(
          prefs.defaultPracticesView === "month" ||
            prefs.defaultPracticesView === "list"
            ? prefs.defaultPracticesView
            : "week"
        )
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
      setDefaultViewState(res.defaultView === "list" ? "list" : "gallery")
    } catch (err) {
      setDefaultViewState(previous)
      throw err
    }
  }, [defaultView])

  const setDefaultPracticesView = useCallback(
    async (value: DefaultPracticesView) => {
      const previous = defaultPracticesView
      setDefaultPracticesViewState(value)
      try {
        const res = await api.updateViewPreference({
          defaultPracticesView: value,
        })
        setDefaultPracticesViewState(
          res.defaultPracticesView === "month" ||
            res.defaultPracticesView === "list"
            ? res.defaultPracticesView
            : "week"
        )
      } catch (err) {
        setDefaultPracticesViewState(previous)
        throw err
      }
    },
    [defaultPracticesView]
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

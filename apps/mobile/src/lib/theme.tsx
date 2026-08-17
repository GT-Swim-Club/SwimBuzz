import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Appearance, useColorScheme } from "react-native"
import * as SecureStore from "expo-secure-store"
import { PaletteProvider } from "@swimbuzz/ui"

export { variables, variablesFor } from "./variables"

export type ThemePreference = "light" | "dark" | "system"

const THEME_KEY = "swimbuzz.theme"

type ThemeContextValue = {
  preference: ThemePreference
  setPreference: (value: ThemePreference) => Promise<void>
  colorScheme: "light" | "dark"
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system")
  const systemScheme = useColorScheme()

  useEffect(() => {
    let cancelled = false
    void SecureStore.getItemAsync(THEME_KEY).then((stored) => {
      if (cancelled) return
      const next =
        stored === "light" || stored === "dark" || stored === "system"
          ? stored
          : "system"
      setPreferenceState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setPreference = useCallback(async (value: ThemePreference) => {
    setPreferenceState(value)
    await SecureStore.setItemAsync(THEME_KEY, value)
  }, [])

  const colorScheme: "light" | "dark" =
    preference === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : preference

  useEffect(() => {
    Appearance.setColorScheme(preference === "system" ? null : preference)
  }, [preference])

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference,
      colorScheme,
    }),
    [preference, setPreference, colorScheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      <PaletteProvider scheme={colorScheme}>{children}</PaletteProvider>
    </ThemeContext.Provider>
  )
}

export function useThemePreference() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useThemePreference must be used within ThemeProvider")
  }
  return ctx
}

import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useMemo } from "react"
import { AuthProvider } from "../src/lib/auth"
import { ThemeProvider, useThemePreference } from "../src/lib/theme"
import { ViewPreferencesProvider } from "../src/lib/view-preferences"
import { ToastProvider, usePalette } from "@swimbuzz/ui"

function ThemedStack() {
  const { colorScheme } = useThemePreference()
  const c = usePalette()
  const navigationTheme = useMemo(
    () => ({
      ...(colorScheme === "dark" ? DarkTheme : DefaultTheme),
      dark: colorScheme === "dark",
      colors: {
        ...(colorScheme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
        primary: c.primary,
        background: c.bgLayout,
        card: c.bgContainer,
        text: c.text,
        border: c.border,
        notification: c.error,
      },
    }),
    [c, colorScheme]
  )
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.primaryBg },
          headerTintColor: c.primaryText,
          contentStyle: { backgroundColor: c.bgLayout },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
    </NavigationThemeProvider>
  )
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ViewPreferencesProvider>
          <ToastProvider>
            <ThemedStack />
          </ToastProvider>
        </ViewPreferencesProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

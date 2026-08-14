"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes"

export default function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // React 19 warns about <script> in client components unless type is a data block.
  // Keep a real script on SSR so the theme applies before paint; on the client use
  // application/json so React skips the warning (next-themes already suppressHydrationWarning).
  const scriptProps =
    typeof window === "undefined" ? undefined : ({ type: "application/json" } as const)

  return (
    <NextThemesProvider {...props} scriptProps={scriptProps}>
      {children}
    </NextThemesProvider>
  )
}

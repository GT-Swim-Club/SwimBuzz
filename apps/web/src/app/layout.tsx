import type { Metadata } from "next"
import { Suspense } from "react"
import SessionProvider from "@/components/SessionProvider"
import ThemeProvider from "@/components/ThemeProvider"
import ScraperUiProvider from "@/components/ScraperUiProvider"
import ImportTaskProvider from "@/components/ImportTaskProvider"
import ImportToast from "@/components/ImportToast"
import Nav from "@/components/Nav"
import NavigationTracker from "@/components/NavigationTracker"
import "./variables.css"
import "./globals.css"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "SwimBuzz",
  description: "SwimBuzz is a tool for Georgia Tech Swim Club to manage their athletes and results.",
  icons: {
    icon: "/swimbuzz-logo.png",
    apple: "/swimbuzz-logo.png",
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen overflow-x-hidden bg-background">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SessionProvider session={session}>
            <ImportTaskProvider>
              <ScraperUiProvider>
                <Nav />
                <Suspense fallback={null}>
                  <NavigationTracker />
                </Suspense>
                <div className="mx-auto max-w-7xl px-2 py-6 sm:py-8">
                  {children}
                </div>
              </ScraperUiProvider>
              <ImportToast />
            </ImportTaskProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

import type { Metadata, Viewport } from "next"
import { Suspense } from "react"
import SessionProvider from "@/components/auth/SessionProvider"
import ThemeProvider from "@/components/ui/ThemeProvider"
import ScraperUiProvider from "@/components/scraper/ScraperUiProvider"
import ImportTaskProvider from "@/components/ui/ImportTaskProvider"
import ImportToast from "@/components/ui/ImportToast"
import AthletePairingProvider from "@/components/meet/AthletePairingProvider"
import ResumeScraperTasks from "@/components/scraper/ResumeScraperTasks"
import KeyboardViewportFix from "@/components/ui/KeyboardViewportFix"
import Nav from "@/components/nav/Nav"
import NavigationTracker from "@/components/nav/NavigationTracker"
import "./variables.css"
import "./globals.css"
import "react-pdf/dist/Page/TextLayer.css"
import { getSession } from "@/lib/auth/session"
import { readListLayouts } from "@/lib/list-layout-server"
import { SavedListLayoutsProvider } from "@/components/ui/ListLayout"

// maximumScale: 1 stops iOS Safari from auto-zooming into a focused input.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: "SwimBuzz",
  description: "SwimBuzz is a tool for Georgia Tech Swim Club to manage their athletes and results.",
  icons: {
    icon: "/swimbuzz-logo.png",
    apple: "/swimbuzz-logo.png",
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, listLayouts] = await Promise.all([getSession(), readListLayouts()])

  return (
    <html lang="en" className="overflow-hidden" suppressHydrationWarning>
      <body className="flex h-[var(--app-height,100dvh)] flex-col overflow-x-hidden overflow-y-auto bg-background">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SessionProvider session={session}>
            <ImportTaskProvider>
              <AthletePairingProvider>
                <KeyboardViewportFix />
                <ResumeScraperTasks />
                <ScraperUiProvider>
                  <Nav />
                  <Suspense fallback={null}>
                    <NavigationTracker />
                  </Suspense>
                  {/* Inherit overflow so dialogs that lock body scrolling also lock this area. */}
                  <main id="page-scroll" className="min-h-0 flex-1 overflow-x-hidden [overflow-y:inherit]">
                    <div className="w-full min-w-0 px-(--page-gutter-x) py-(--page-gutter-y)">
                      <SavedListLayoutsProvider layouts={listLayouts}>{children}</SavedListLayoutsProvider>
                    </div>
                  </main>
                </ScraperUiProvider>
              </AthletePairingProvider>
              <ImportToast />
            </ImportTaskProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

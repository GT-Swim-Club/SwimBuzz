import type { Metadata } from "next"
import { Suspense } from "react"
import SessionProvider from "@/components/auth/SessionProvider"
import ThemeProvider from "@/components/ui/ThemeProvider"
import ScraperUiProvider from "@/components/scraper/ScraperUiProvider"
import ImportTaskProvider from "@/components/ui/ImportTaskProvider"
import ImportToast from "@/components/ui/ImportToast"
import Nav from "@/components/nav/Nav"
import NavigationTracker from "@/components/nav/NavigationTracker"
import "./variables.css"
import "./globals.css"
import "react-pdf/dist/Page/TextLayer.css"
import { getSession } from "@/lib/auth/session"

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
    <html lang="en" className="overflow-hidden" suppressHydrationWarning>
      <body className="flex h-dvh flex-col overflow-x-hidden overflow-y-auto bg-background">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SessionProvider session={session}>
            <ImportTaskProvider>
              <ScraperUiProvider>
                <Nav />
                <Suspense fallback={null}>
                  <NavigationTracker />
                </Suspense>
                {/* Inherit overflow so dialogs that lock body scrolling also lock this area. */}
                <main id="page-scroll" className="min-h-0 flex-1 overflow-x-hidden [overflow-y:inherit]">
                  <div className="mx-auto w-full min-w-0 max-w-7xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8 xl:max-w-none xl:px-[clamp(8rem,10vw,18rem)]">
                    {children}
                  </div>
                </main>
              </ScraperUiProvider>
              <ImportToast />
            </ImportTaskProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import SessionProvider from "@/components/SessionProvider"
import ThemeProvider from "@/components/ThemeProvider"
import ScraperUiProvider from "@/components/ScraperUiProvider"
import Nav from "@/components/Nav"
import "./globals.css"

export const metadata: Metadata = {
  title: "SwimBuzz",
  description: "SwimBuzz is a tool for Georgia Tech Swim Club to manage their athletes and results.",
  icons: {
    icon: "/swimbuzz-logo.png",
    apple: "/swimbuzz-logo.png",
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-white transition-colors dark:bg-zinc-950">
        <ThemeProvider>
          <SessionProvider session={session}>
            <ScraperUiProvider>
              <Nav />
              <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
                {children}
              </div>
            </ScraperUiProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
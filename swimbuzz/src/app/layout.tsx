import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import SessionProvider from "@/components/SessionProvider"
import ThemeProvider from "@/components/ThemeProvider"
import Nav from "@/components/Nav"
import "./globals.css"

export const metadata: Metadata = {
  title: "GTSC Tools",
  description: "Georgia Tech Swim Club",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white dark:bg-zinc-900 dark:bg-zinc-950 min-h-screen transition-colors">
        <ThemeProvider>
          <SessionProvider session={session}>
            <Nav />
            <div className="max-w-5xl mx-auto px-4 py-8">
              {children}
            </div>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
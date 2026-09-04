"use client"
import { useEffect, useRef } from "react"
import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react"

/**
 * next-auth broadcasts sign-out across same-browser tabs (via a "storage"
 * event) and updates useSession()'s status here, but that alone doesn't
 * refresh already-rendered server components — a tab can keep showing
 * stale signed-in content. Force a hard reload when this tab's status
 * flips from authenticated to unauthenticated so every open tab drops
 * the session the moment any one of them signs out.
 */
function CrossTabSignOutWatcher() {
  const { status } = useSession()
  const wasAuthenticated = useRef(false)

  useEffect(() => {
    if (status === "authenticated") {
      wasAuthenticated.current = true
    } else if (status === "unauthenticated" && wasAuthenticated.current) {
      window.location.assign("/")
    }
  }, [status])

  return null
}

export default function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session: any
}) {
  return (
    <NextAuthSessionProvider session={session}>
      <CrossTabSignOutWatcher />
      {children}
    </NextAuthSessionProvider>
  )
}
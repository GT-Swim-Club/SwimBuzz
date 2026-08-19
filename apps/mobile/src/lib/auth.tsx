import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { SessionUser } from "@swimbuzz/shared"
import {
  api,
  clearSession,
  loadStoredUser,
  refreshSession,
  saveSession,
  setUnauthorizedHandler,
} from "./api"

type AuthState = {
  user: SessionUser | null
  loading: boolean
  signInWithEmail: (email: string, code: string) => Promise<void>
  signInWithGoogle: (idToken: string, staffLinkToken?: string) => Promise<void>
  requestCode: (email: string) => Promise<void>
  /** Step 1 of coach/exec sign-in: verify the GT-email OTP, get a staff-link token for the Google step. */
  verifyStaffCode: (email: string, code: string) => Promise<string>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(async () => {
    await clearSession()
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut()
    })
    ;(async () => {
      try {
        const stored = await loadStoredUser()
        if (stored) {
          setUser(stored)
          const refreshed = await refreshSession()
          if (refreshed) setUser(refreshed.user)
          else {
            try {
              const me = await api.me()
              setUser(me.user)
            } catch {
              await clearSession()
              setUser(null)
            }
          }
        }
      } finally {
        setLoading(false)
      }
    })()
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  const requestCode = useCallback(async (email: string) => {
    const res = await api.requestEmailCode(email)
    if (res && typeof res === "object" && "error" in res && res.error) {
      throw new Error(String(res.error))
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, code: string) => {
    const tokens = await api.mobileEmailLogin(email, code)
    await saveSession(tokens)
    setUser(tokens.user)
  }, [])

  const signInWithGoogle = useCallback(
    async (idToken: string, staffLinkToken?: string) => {
      const tokens = await api.mobileGoogleLogin(idToken, staffLinkToken)
      await saveSession(tokens)
      setUser(tokens.user)
    },
    []
  )

  const verifyStaffCode = useCallback(async (email: string, code: string) => {
    const res = await api.staffVerify(email, code)
    if ("error" in res && res.error) throw new Error(String(res.error))
    if (!("staffLinkToken" in res) || !res.staffLinkToken) {
      throw new Error("Verification failed. Try again.")
    }
    return res.staffLinkToken
  }, [])

  const refreshUser = useCallback(async () => {
    const me = await api.me()
    setUser(me.user)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      signInWithEmail,
      signInWithGoogle,
      requestCode,
      verifyStaffCode,
      signOut,
      refreshUser,
    }),
    [
      user,
      loading,
      signInWithEmail,
      signInWithGoogle,
      requestCode,
      verifyStaffCode,
      signOut,
      refreshUser,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

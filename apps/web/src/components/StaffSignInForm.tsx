"use client"

import { useState, FormEvent } from "react"
import SignInButton from "@/components/SignInButton"

type Step = "email" | "code" | "google"

/**
 * Coach/exec sign-in: GT-email OTP first (proves roster identity), then
 * Google (proves staff status via a @gtswimclub.com address) — both required
 * on every sign-in. Step 1 sets an HttpOnly staff-link cookie server-side
 * (POST /api/auth/staff/verify); it never issues a session on its own. Step 2
 * reuses SignInButton, whose popup + session-poll flow is unchanged — the
 * NextAuth `signIn` callback redeems the cookie and links the Google account
 * to this same roster user.
 */
export default function StaffSignInForm({
  callbackUrl = "/athletes",
}: {
  callbackUrl?: string
}) {
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function requestCode() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || "Could not send a code. Try again.")
        return
      }
      setStep("code")
      setCode("")
    } catch {
      setError("Could not send a code. Try again.")
    } finally {
      setLoading(false)
    }
  }

  async function onRequestCode(e: FormEvent) {
    e.preventDefault()
    await requestCode()
  }

  async function onVerifyCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/staff/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || "Invalid or expired code. Request a new one and try again.")
        return
      }
      setStep("google")
    } catch {
      setError("Sign in failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (step === "google") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-border-secondary bg-fill-secondary px-3 py-2 text-[13px] text-foreground-secondary">
          Email verified as <span className="font-medium text-foreground">{email}</span>.
          Now continue with your @gtswimclub.com Google account.
        </p>
        <SignInButton callbackUrl={callbackUrl} />
        <button
          type="button"
          className="text-[13px] text-foreground-tertiary hover:text-foreground"
          onClick={() => {
            setStep("email")
            setError(null)
            setCode("")
          }}
        >
          ← Start over
        </button>
      </div>
    )
  }

  if (step === "code") {
    return (
      <form onSubmit={onVerifyCode} className="space-y-4">
        <div>
          <label
            htmlFor="staff-otp-code"
            className="block text-[15px] font-medium text-foreground-secondary"
          >
            Verification code
          </label>
          <p className="mt-1 text-[13px] text-foreground-tertiary">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-foreground">{email}</span>
          </p>
          <input
            id="staff-otp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-mono text-lg tracking-[0.35em] text-foreground outline-none ring-primary/20 transition focus:border-primary focus:ring-4 dark:border-border dark:bg-background-elevated"
            placeholder="000000"
            autoFocus
          />
        </div>

        {error && (
          <p className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-[15px] text-error-text">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-[15px] font-medium text-primary-text transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Verifying…" : "Verify email"}
        </button>

        <div className="flex items-center justify-between text-[13px] text-foreground-tertiary">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => {
              setStep("email")
              setError(null)
              setCode("")
            }}
          >
            ← Use a different email
          </button>
          <button
            type="button"
            disabled={loading}
            className="hover:text-foreground disabled:opacity-50"
            onClick={() => void requestCode()}
          >
            Resend code
          </button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={onRequestCode} className="space-y-4">
      <div>
        <label
          htmlFor="staff-gatech-email"
          className="block text-[15px] font-medium text-foreground-secondary"
        >
          Georgia Tech Email
        </label>
        <p className="mt-1 text-[13px] text-foreground-tertiary">
          Coaches and exec verify their roster email first, then sign in with
          their @gtswimclub.com Google account.
        </p>
        <input
          id="staff-gatech-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground outline-none ring-primary/20 transition focus:border-primary focus:ring-4 dark:border-border dark:bg-background-elevated"
          placeholder="gburdell3@gatech.edu"
          autoFocus
        />
      </div>

      {error && (
        <p className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-[15px] text-error-text">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-[15px] font-medium text-primary-text transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Sending code…" : "Send verification code"}
      </button>
    </form>
  )
}

"use client"

import { useState, FormEvent } from "react"
import Image from "next/image"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

type Step = "email" | "code"

const OUTLOOK_WEB_URL = "https://outlook.office.com/mail/"

export default function EmailSignInForm({
  callbackUrl = "/athletes",
}: {
  callbackUrl?: string
}) {
  const router = useRouter()
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
      const result = await signIn("email-otp", {
        email,
        code,
        redirect: false,
        callbackUrl,
      })
      if (result?.error) {
        // authorize() throws a specific message for a coach/exec account
        // (see [...nextauth]/route.ts); anything else is an invalid code.
        setError(
          result.error === "CredentialsSignin"
            ? "Invalid or expired code. Request a new one and try again."
            : result.error
        )
        return
      }
      router.push(result?.url || callbackUrl)
      router.refresh()
    } catch {
      setError("Sign in failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={onVerifyCode} className="space-y-4">
        <div>
          <label
            htmlFor="otp-code"
            className="block text-[15px] font-medium text-foreground-secondary"
          >
            Verification code
          </label>
          <p className="mt-1 text-[13px] text-foreground-tertiary">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-foreground">
              {email}
            </span>
          </p>
          <input
            id="otp-code"
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
          {loading ? "Signing in…" : "Verify and sign in"}
        </button>

        <a
          href={OUTLOOK_WEB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-5 py-3 text-[15px] font-medium text-foreground shadow-sm transition-colors hover:bg-fill-secondary"
        >
          <Image
            src="/outlook-icon.png"
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 shrink-0"
          />
          Open Outlook
        </a>

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
          htmlFor="gatech-email"
          className="block text-[15px] font-medium text-foreground-secondary"
        >
          Georgia Tech Email
        </label>
        <input
          id="gatech-email"
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

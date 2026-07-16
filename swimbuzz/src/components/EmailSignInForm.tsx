"use client"

import { useState, FormEvent } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

type Step = "email" | "code"

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
        setError("Invalid or expired code. Request a new one and try again.")
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
            className="block text-sm font-medium text-gray-700 dark:text-zinc-300"
          >
            Verification code
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-zinc-500">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-gray-700 dark:text-zinc-300">
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
            className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.35em] text-gray-900 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="000000"
            autoFocus
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Verify and sign in"}
        </button>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-zinc-500">
          <button
            type="button"
            className="hover:text-gray-800 dark:hover:text-zinc-300"
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
            className="hover:text-gray-800 disabled:opacity-50 dark:hover:text-zinc-300"
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
          className="block text-sm font-medium text-gray-700 dark:text-zinc-300"
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
          className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          placeholder="gburdell3@gatech.edu"
          autoFocus
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Sending code…" : "Send verification code"}
      </button>
    </form>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function CancelPendingProfileChangesButton({
  athleteId,
}: {
  athleteId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelPendingProfileChanges: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to cancel request")
        return
      }
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void cancel()}
        disabled={loading}
        className="text-sm text-foreground-secondary underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
      >
        {loading ? "Canceling…" : "Cancel pending request"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

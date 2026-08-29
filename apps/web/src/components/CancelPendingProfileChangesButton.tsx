"use client"

import { useState, useTransition } from "react"
import { cancelPendingProfileChanges } from "./athlete-profile.actions"

export default function CancelPendingProfileChangesButton({
  athleteId,
}: {
  athleteId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const loading = isPending

  function cancel() {
    setError(null)
    startTransition(async () => {
      try {
        await cancelPendingProfileChanges(athleteId)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cancel request")
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={cancel}
        disabled={loading}
        className="text-sm text-foreground-secondary underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
      >
        {loading ? "Canceling…" : "Cancel pending request"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

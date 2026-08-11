"use client"

import { useState } from "react"
import { formatDateTime, formatRelativeTime } from "@/lib/utils"

export default function RequestTimesImportButton({
  athleteId,
  hasSwimCloudId,
  timesSyncedAt,
}: {
  athleteId: string
  hasSwimCloudId: boolean
  timesSyncedAt: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function requestImport() {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/athletes/${athleteId}/request-times-import`, {
        method: "POST",
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Failed to send times import request"
        )
        return
      }

      setMessage("Requested — coaches have been notified")
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (!hasSwimCloudId) {
    return (
      <p className="text-sm text-foreground-secondary">
        Set your SwimCloud ID in{" "}
        <a
          href="/settings"
          className="text-primary hover:text-primary-hover"
        >
          Settings
        </a>{" "}
        before requesting a times import.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void requestImport()}
          disabled={loading}
          className="text-sm px-4 py-2 border border-border-secondary rounded-lg hover:bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
        >
          {loading ? "Requesting…" : "Request Import"}
        </button>
        {!loading && (
          <span
            className="text-xs text-foreground-tertiary"
            title={timesSyncedAt ? formatDateTime(timesSyncedAt) : undefined}
          >
            {timesSyncedAt
              ? `Last imported ${formatRelativeTime(timesSyncedAt)}`
              : "Never imported"}
          </span>
        )}
      </div>
      <p className="text-xs text-foreground-secondary">
        Ask a coach to import or reimport your times from SwimCloud.
      </p>
      {message && (
        <p className="text-xs text-info">{message}</p>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}

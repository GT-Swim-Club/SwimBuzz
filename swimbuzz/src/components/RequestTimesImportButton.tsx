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
      <p className="text-sm text-gray-500 dark:text-zinc-400">
        Set your SwimCloud ID in{" "}
        <a
          href="/settings"
          className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
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
          className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
        >
          {loading ? "Requesting…" : "Request import"}
        </button>
        {!loading && (
          <span
            className="text-xs text-gray-400 dark:text-zinc-500"
            title={timesSyncedAt ? formatDateTime(timesSyncedAt) : undefined}
          >
            {timesSyncedAt
              ? `Last imported ${formatRelativeTime(timesSyncedAt)}`
              : "Never imported"}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-zinc-400">
        Ask a coach to import or reimport your times from SwimCloud.
      </p>
      {message && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{message}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

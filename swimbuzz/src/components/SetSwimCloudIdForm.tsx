"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { isValidSwimCloudIdInput, SWIMCLOUD_ID_ERROR } from "@/lib/swimcloud-id"

export default function SetSwimCloudIdForm({
  athleteId,
  initialSwimCloudId = null,
  requiresApproval = false,
  pendingSwimCloudId = null,
}: {
  athleteId: string
  initialSwimCloudId?: number | null
  requiresApproval?: boolean
  pendingSwimCloudId?: number | null
}) {
  const router = useRouter()
  const [swimCloudId, setSwimCloudId] = useState(
    pendingSwimCloudId != null
      ? String(pendingSwimCloudId)
      : initialSwimCloudId != null
        ? String(initialSwimCloudId)
        : ""
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const baseline =
    pendingSwimCloudId != null
      ? String(pendingSwimCloudId)
      : initialSwimCloudId != null
        ? String(initialSwimCloudId)
        : ""
  const hasChanged = swimCloudId !== baseline
  const swimCloudIdValid = isValidSwimCloudIdInput(swimCloudId)
  const showDigitHint = swimCloudId.length > 0 && !swimCloudIdValid
  const canSubmit = !loading && hasChanged && swimCloudIdValid

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swimCloudId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to save SwimCloud ID")
        return
      }

      if (requiresApproval) {
        setMessage("Requested — waiting for coach approval")
      } else if (data.swimCloudId != null) {
        setSwimCloudId(String(data.swimCloudId))
      }
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">
            SwimCloud ID
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{7}"
            maxLength={7}
            required
            placeholder="e.g. 1234567"
            title={SWIMCLOUD_ID_ERROR}
            value={swimCloudId}
            onChange={(e) => {
              setSwimCloudId(e.target.value.replace(/\D/g, "").slice(0, 7))
              setError(null)
            }}
            className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
            aria-invalid={showDigitHint}
            aria-describedby={showDigitHint ? "swimcloud-id-hint" : undefined}
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
        >
          {loading
            ? requiresApproval
              ? "Requesting…"
              : "Saving…"
            : requiresApproval
              ? "Request"
              : "Save"}
        </button>
      </div>
      {showDigitHint && (
        <p id="swimcloud-id-hint" className="text-xs text-amber-600 dark:text-amber-400">
          {SWIMCLOUD_ID_ERROR} ({swimCloudId.length}/7)
        </p>
      )}
      {pendingSwimCloudId != null && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Pending approval: {pendingSwimCloudId}
          {initialSwimCloudId != null ? ` (current: ${initialSwimCloudId})` : ""}
        </p>
      )}
      {message && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{message}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  )
}

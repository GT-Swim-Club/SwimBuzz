"use client"

import { useState, useTransition } from "react"
import {
  isValidSwimCloudIdInput,
  SWIMCLOUD_ID_ERROR,
  SWIMCLOUD_ID_MAX_LENGTH,
} from "@/lib/swim/swimcloud-id"
import { updateSwimCloudId } from "./athlete-profile.actions"

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
  const [swimCloudId, setSwimCloudId] = useState(
    pendingSwimCloudId != null
      ? String(pendingSwimCloudId)
      : initialSwimCloudId != null
        ? String(initialSwimCloudId)
        : ""
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const loading = isPending

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setMessage(null)

    startTransition(async () => {
      try {
        await updateSwimCloudId(athleteId, swimCloudId)
        if (requiresApproval) {
          setMessage("Requested — waiting for coach approval")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save SwimCloud ID")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs text-foreground-secondary mb-1 block">
            SwimCloud ID
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern={`\\d{6,${SWIMCLOUD_ID_MAX_LENGTH}}`}
            maxLength={SWIMCLOUD_ID_MAX_LENGTH}
            required
            placeholder="e.g. 1234567"
            title={SWIMCLOUD_ID_ERROR}
            value={swimCloudId}
            onChange={(e) => {
              setSwimCloudId(
                e.target.value.replace(/\D/g, "").slice(0, SWIMCLOUD_ID_MAX_LENGTH)
              )
              setError(null)
            }}
            className="w-full border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background border-border-secondary"
            aria-invalid={showDigitHint}
            aria-describedby={showDigitHint ? "swimcloud-id-hint" : undefined}
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="text-sm px-4 py-2 border border-border-secondary rounded-lg hover:bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
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
        <p id="swimcloud-id-hint" className="text-xs text-info">
          {SWIMCLOUD_ID_ERROR} ({swimCloudId.length}/{SWIMCLOUD_ID_MAX_LENGTH})
        </p>
      )}
      {pendingSwimCloudId != null && (
        <p className="text-xs text-info">
          Pending approval: {pendingSwimCloudId}
          {initialSwimCloudId != null ? ` (current: ${initialSwimCloudId})` : ""}
        </p>
      )}
      {message && (
        <p className="text-xs text-info">{message}</p>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </form>
  )
}

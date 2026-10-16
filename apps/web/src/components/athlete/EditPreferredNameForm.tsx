"use client"

import { useState, useTransition } from "react"
import { updatePreferredName } from "./athlete-profile.actions"

export default function EditPreferredNameForm({
  athleteId,
  initialPreferredName,
  requiresApproval = false,
  pendingPreferredName,
}: {
  athleteId: string
  initialPreferredName: string | null
  requiresApproval?: boolean
  /** undefined = no pending request; null = pending request to clear it. */
  pendingPreferredName?: string | null
}) {
  const baseline =
    (pendingPreferredName !== undefined ? pendingPreferredName : initialPreferredName) ?? ""
  const [preferredName, setPreferredName] = useState(baseline)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const loading = isPending

  const hasChanged = preferredName.trim() !== baseline
  const canSubmit = !loading && hasChanged

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setMessage(null)

    startTransition(async () => {
      try {
        await updatePreferredName(athleteId, preferredName.trim() || null)
        if (requiresApproval) {
          setMessage("Requested — waiting for coach approval")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save preferred name")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs text-foreground-secondary mb-1 block">
            Preferred name
          </label>
          <input
            type="text"
            placeholder="Optional"
            value={preferredName}
            onChange={(e) => {
              setPreferredName(e.target.value)
              setError(null)
            }}
            className="w-full border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background border-border-secondary"
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
      {pendingPreferredName !== undefined && (
        <p className="text-xs text-info">
          Pending approval: {pendingPreferredName ?? "(none)"}
          {` (current: ${initialPreferredName ?? "none"})`}
        </p>
      )}
      {message && (
        <p className="text-xs text-info">{message}</p>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </form>
  )
}

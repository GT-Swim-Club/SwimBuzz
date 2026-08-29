"use client"

import { useState, useTransition } from "react"
import NicknameTagsInput from "@/components/NicknameTagsInput"
import { updateNicknames } from "./athlete-profile.actions"

export default function EditNicknamesForm({
  athleteId,
  initialNicknames,
  requiresApproval = false,
  pendingNicknames = null,
}: {
  athleteId: string
  initialNicknames: string[]
  requiresApproval?: boolean
  pendingNicknames?: string[] | null
}) {
  const [nicknames, setNicknames] = useState(
    pendingNicknames ?? initialNicknames
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const loading = isPending

  const baseline = pendingNicknames ?? initialNicknames
  const hasChanged =
    nicknames.length !== baseline.length ||
    nicknames.some((name, i) => name !== baseline[i])

  function persist(next: string[]) {
    if (requiresApproval) {
      setNicknames(next)
      setMessage(null)
      return
    }

    const previous = nicknames
    setNicknames(next)
    setError(null)

    startTransition(async () => {
      try {
        await updateNicknames(athleteId, next)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save alternate names")
        setNicknames(previous)
      }
    })
  }

  function requestApproval() {
    if (!hasChanged) return
    setError(null)
    setMessage(null)

    startTransition(async () => {
      try {
        await updateNicknames(athleteId, nicknames)
        setMessage("Requested — waiting for coach approval")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to request nickname changes")
      }
    })
  }

  return (
    <div>
      <NicknameTagsInput
        value={nicknames}
        onChange={persist}
        disabled={loading}
        showAddButton
        placeholder="Add nickname"
        actions={
          requiresApproval ? (
            <button
              type="button"
              onClick={requestApproval}
              disabled={loading || !hasChanged}
              className="text-sm px-4 py-2 border border-border rounded-lg hover:bg-fill-secondary disabled:opacity-40 transition-colors"
            >
              {loading ? "Requesting…" : "Request"}
            </button>
          ) : null
        }
      />
      {pendingNicknames != null && (
        <p className="mt-1 text-xs text-info">
          Pending approval:{" "}
          {pendingNicknames.length > 0
            ? pendingNicknames.join(", ")
            : "(none)"}
          {initialNicknames.length > 0
            ? ` (current: ${initialNicknames.join(", ")})`
            : " (current: none)"}
        </p>
      )}
      {message && (
        <p className="mt-1 text-xs text-info">{message}</p>
      )}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}

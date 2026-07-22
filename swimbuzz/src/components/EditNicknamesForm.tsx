"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import NicknameTagsInput from "@/components/NicknameTagsInput"

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
  const router = useRouter()
  const [nicknames, setNicknames] = useState(
    pendingNicknames ?? initialNicknames
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const baseline = pendingNicknames ?? initialNicknames
  const hasChanged =
    nicknames.length !== baseline.length ||
    nicknames.some((name, i) => name !== baseline[i])

  async function persist(next: string[]) {
    if (requiresApproval) {
      setNicknames(next)
      setMessage(null)
      return
    }

    setNicknames(next)
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicknames: next }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to save alternate names")
        setNicknames(nicknames)
        return
      }

      setNicknames(data.nicknames ?? next)
      router.refresh()
    } catch {
      setError("Something went wrong")
      setNicknames(nicknames)
    } finally {
      setLoading(false)
    }
  }

  async function requestApproval() {
    if (!hasChanged) return
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicknames }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to request nickname changes")
        return
      }

      setMessage("Requested — waiting for coach approval")
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
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
              onClick={() => void requestApproval()}
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

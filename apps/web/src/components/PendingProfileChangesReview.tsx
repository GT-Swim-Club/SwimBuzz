"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { PendingProfileChanges } from "@/lib/pending-profile-changes"

export default function PendingProfileChangesReview({
  athleteId,
  pending,
  currentSwimCloudId,
  currentNicknames,
}: {
  athleteId: string
  pending: PendingProfileChanges
  currentSwimCloudId: number | null
  currentNicknames: string[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(action: "approve" | "reject") {
    setLoading(action)
    setError(null)
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { approvePendingProfileChanges: true }
            : { rejectPendingProfileChanges: true }
        ),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Failed to ${action}`)
        return
      }
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(null)
    }
  }

  return (
    <section className="rounded-xl border border-warning bg-warning-bg p-4">
      <h2 className="text-sm font-medium text-warning-contrast">
        Pending profile changes
      </h2>
      <p className="mt-1 text-xs text-warning-contrast/80">
        This athlete requested updates that need your approval.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-warning-contrast">
        {pending.swimCloudId !== undefined && (
          <li>
            SwimCloud ID:{" "}
            <span className="font-medium">{pending.swimCloudId}</span>
            <span className="text-warning-contrast/70">
              {" "}
              (current: {currentSwimCloudId ?? "none"})
            </span>
          </li>
        )}
        {pending.nicknames !== undefined && (
          <li>
            Nicknames:{" "}
            <span className="font-medium">
              {pending.nicknames.length > 0
                ? pending.nicknames.join(", ")
                : "(none)"}
            </span>
            <span className="text-warning-contrast/70">
              {" "}
              (current:{" "}
              {currentNicknames.length > 0
                ? currentNicknames.join(", ")
                : "none"}
              )
            </span>
          </li>
        )}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => void act("approve")}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
        >
          {loading === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => void act("reject")}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-fill-secondary disabled:opacity-50"
        >
          {loading === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </section>
  )
}

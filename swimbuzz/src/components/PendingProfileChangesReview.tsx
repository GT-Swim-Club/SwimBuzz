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
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
      <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
        Pending profile changes
      </h2>
      <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
        This athlete requested updates that need your approval.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-amber-950 dark:text-amber-100">
        {pending.swimCloudId !== undefined && (
          <li>
            SwimCloud ID:{" "}
            <span className="font-medium">{pending.swimCloudId}</span>
            <span className="text-amber-800/70 dark:text-amber-300/70">
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
            <span className="text-amber-800/70 dark:text-amber-300/70">
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
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => void act("reject")}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 disabled:opacity-50"
        >
          {loading === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  )
}

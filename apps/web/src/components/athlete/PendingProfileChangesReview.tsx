"use client"

import { useState, useTransition } from "react"
import type { PendingProfileChanges } from "@/lib/athlete/pending-profile-changes"
import { approvePendingProfileChanges, rejectPendingProfileChanges } from "./athlete-profile.actions"

export default function PendingProfileChangesReview({
  athleteId,
  pending,
  currentSwimCloudId,
  currentPreferredName,
}: {
  athleteId: string
  pending: PendingProfileChanges
  currentSwimCloudId: number | null
  currentPreferredName: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [activeAction, setActiveAction] = useState<"approve" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = isPending ? activeAction : null

  function act(action: "approve" | "reject") {
    setActiveAction(action)
    setError(null)
    startTransition(async () => {
      try {
        await (action === "approve"
          ? approvePendingProfileChanges(athleteId)
          : rejectPendingProfileChanges(athleteId))
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to ${action}`)
      }
    })
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
        {pending.preferredName !== undefined && (
          <li>
            Preferred name:{" "}
            <span className="font-medium">{pending.preferredName ?? "(none)"}</span>
            <span className="text-warning-contrast/70">
              {" "}
              (current: {currentPreferredName ?? "none"})
            </span>
          </li>
        )}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => act("approve")}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
        >
          {loading === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => act("reject")}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-fill-secondary disabled:opacity-50"
        >
          {loading === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </section>
  )
}

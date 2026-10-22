"use client"

import { useState, useTransition } from "react"
import SwimCloudIdsInput, { useSwimCloudIdsField } from "./SwimCloudIdsInput"
import { updateSwimCloudIds } from "./athlete-profile.actions"

/** Coach form linking an unlinked athlete to their SwimCloud profiles. */
export default function SetSwimCloudIdForm({ athleteId }: { athleteId: string }) {
  const swimCloud = useSwimCloudIdsField()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const loading = isPending

  const canSubmit = !loading && swimCloud.valid && swimCloud.allIds.length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)

    startTransition(async () => {
      try {
        await updateSwimCloudIds(athleteId, swimCloud.allIds)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save SwimCloud IDs")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[140px]">
          <label
            htmlFor="set-swimcloud-ids"
            className="text-xs text-foreground-secondary mb-1 block"
          >
            SwimCloud ID/URL
          </label>
          <SwimCloudIdsInput field={swimCloud} id="set-swimcloud-ids" />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 text-sm px-4 py-2 border border-border-secondary rounded-lg hover:bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </form>
  )
}

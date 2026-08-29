"use client"

import { useTransition } from "react"
import ActionIcon from "@/components/ActionIcon"
import { removeRosterOnlyEntry } from "./RemoveRosterOnlyButton.actions"

export default function RemoveRosterOnlyButton({
  meetId,
  athleteId,
  athleteName,
}: {
  meetId: string
  athleteId: string
  athleteName: string
}) {
  const [isPending, startTransition] = useTransition()
  const loading = isPending

  function handleRemove() {
    if (!confirm(`Remove ${athleteName } from the roster summary?`)) return
    startTransition(async () => {
      try {
        await removeRosterOnlyEntry(meetId, athleteId)
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to remove athlete")
      }
    })
  }

  return (
    <button
      type="button"
      onClick={() => void handleRemove()}
      disabled={loading}
      className="p-1 rounded text-foreground-tertiary hover:text-error disabled:opacity-50 transition-colors"
      aria-label={`Remove ${athleteName } from roster`}
    >
      <ActionIcon kind="delete" className="w-4 h-4" />
    </button>
  )
}

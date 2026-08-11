"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import ActionIcon from "@/components/ActionIcon"

export default function RemoveRosterOnlyButton({
  meetId,
  athleteId,
  athleteName,
}: {
  meetId: string
  athleteId: string
  athleteName: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleRemove() {
    if (!confirm(`Remove ${athleteName } from the roster summary?`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/meets/${meetId}/sheet-entry`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, rosterOnly: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Failed to remove athlete")
        return
      }
      router.refresh()
    } catch {
      alert("Something went wrong")
    } finally {
      setLoading(false)
    }
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

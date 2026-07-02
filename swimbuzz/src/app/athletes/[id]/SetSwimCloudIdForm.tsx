"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function SetSwimCloudIdForm({ athleteId }: { athleteId: string }) {
  const router = useRouter()
  const [swimCloudId, setSwimCloudId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swimCloudId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to save SwimCloud ID")
        return
      }

      setSwimCloudId("")
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[140px]">
        <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">
          SwimCloud ID
        </label>
        <input
          type="number"
          min={1}
          required
          placeholder="e.g. 123456"
          value={swimCloudId}
          onChange={(e) => setSwimCloudId(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !swimCloudId}
        className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
      >
        {loading ? "Saving…" : "Save"}
      </button>
      {error && (
        <p className="w-full text-xs text-red-500">{error}</p>
      )}
    </form>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function EditNicknamesForm({
  athleteId,
  initialNicknames,
}: {
  athleteId: string
  initialNicknames: string[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(initialNicknames.join(", "))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)

    try {
      const nicknames = value
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)

      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicknames }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to save alternate names")
        return
      }

      setValue((data.nicknames ?? []).join(", "))
      setSaved(true)
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="e.g. Dan, Danny"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={loading}
          className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
        >
          {loading ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
        Comma-separated names used to match imported results to this athlete.
      </p>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </form>
  )
}

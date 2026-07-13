"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import NicknameTagsInput from "@/components/NicknameTagsInput"

export default function EditNicknamesForm({
  athleteId,
  initialNicknames,
}: {
  athleteId: string
  initialNicknames: string[]
}) {
  const router = useRouter()
  const [nicknames, setNicknames] = useState(initialNicknames)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function persist(next: string[]) {
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

  return (
    <div>
      <NicknameTagsInput
        value={nicknames}
        onChange={persist}
        disabled={loading}
        showAddButton
        placeholder="Add alternate name"
      />
      <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
        Names used to match imported results to this athlete.
      </p>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { resolveListedSeason, upcomingSeason } from "@/lib/season"
import Modal, { ModalFooter } from "@/components/Modal"

export default function QualifierFilters({
              seasons
}: {
  seasons: string[]
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const gender = searchParams.get("gender") ?? "all"
  const [fetchedSeasons, setFetchedSeasons] = useState<string[]>(seasons)
  const season = resolveListedSeason(searchParams.get("season"), fetchedSeasons)
  
  const [addSeasonModalOpen, setAddSeasonModalOpen] = useState(false)
  const upcoming = upcomingSeason()
  const [addingSeason, setAddingSeason] = useState(false)
  const [addSeasonError, setAddSeasonError] = useState<string | null>(null)

  function update(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") params.delete(key)
      else params.set(key, value)
    }
    router.push(`/qualifiers?${params.toString()}`)
  }

  async function handleAddSeason(e: React.FormEvent) {
    e.preventDefault()
    setAddingSeason(true)
    setAddSeasonError(null)
    
    try {
        const res = await fetch("/api/seasons", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: upcoming })
        })
        
        if (!res.ok) {
            const data = await res.json()
            setAddSeasonError(data.error || "Failed to add season")
            return
        }
        setFetchedSeasons(prev => [...prev, upcoming]);
        update({ season: upcoming });
        setAddSeasonModalOpen(false);
    } finally {
        setAddingSeason(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={gender === "F" || gender === "M" || gender === "all" ? gender : "all"}
        onChange={(e) => update({ gender: e.target.value })}
        className="text-sm border border-border-secondary rounded-lg px-3 py-1.5 bg-background"
      >
        <option value="all">All</option>
        <option value="M">Men</option>
        <option value="F">Women</option>
      </select>
      <select
        value={season}
        onChange={(e) => {
            if (e.target.value === "ADD_NEW") {
                setAddSeasonModalOpen(true)
            } else {
                update({ season: e.target.value })
            }
        }}
        className="text-sm border border-border-secondary rounded-lg px-3 py-1.5 bg-background"
      >
        {fetchedSeasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        {session?.user?.role === "COACH" && !fetchedSeasons.includes(upcoming) && <option value="ADD_NEW">+ New Season</option>}
      </select>

      <Modal
        open={addSeasonModalOpen}
        onClose={() => {
            setAddSeasonModalOpen(false)
            setAddSeasonError(null)
        }}
        title="Add new season"
        maxWidth="sm"
        onSubmit={handleAddSeason}
        footer={
          <ModalFooter>
             {fetchedSeasons.includes(upcoming) ? (
                <button
                    type="button"
                    onClick={() => {
                        setAddSeasonModalOpen(false)
                        setAddSeasonError(null)
                    }}
                    className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-fill-secondary"
                >
                    Close
                </button>
             ) : (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            setAddSeasonModalOpen(false)
                            setAddSeasonError(null)
                        }}
                        className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-fill-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={addingSeason}
                        className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
                    >
                        {addingSeason ? "Adding..." : "Confirm"}
                    </button>
                </>
             )}
          </ModalFooter>
        }
      >
        {fetchedSeasons.includes(upcoming) ? (
            <p className="text-sm text-foreground">Season {upcoming} already exists. You can add another season next year.</p>
        ) : (
            <p className="text-sm text-foreground">Confirm you want to add the {upcoming} season?</p>
        )}
        {addSeasonError && <p className="text-sm text-error">{addSeasonError}</p>}
      </Modal>
    </div>
  )
}

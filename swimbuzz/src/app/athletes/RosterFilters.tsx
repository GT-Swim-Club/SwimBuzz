"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import LiveSearch from "@/components/LiveSearch"
import { currentSeason, parseSeason, upcomingSeason } from "@/lib/season"
import Modal, { ModalFooter } from "@/components/Modal"

function useRosterParams() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const gender = searchParams.get("gender") ?? "all"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("year")
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") params.delete(key)
      else params.set(key, value)
    }
    router.push(`/athletes?${params.toString()}`)
  }

  return { gender, season, updateParams }
}

export function RosterSearch() {
  return <LiveSearch pathname="/athletes" placeholder="Search athletes…" />
}

export default function RosterFilters({ count }: { count: number }) {
  const { gender, season, updateParams } = useRosterParams()
  const [fetchedSeasons, setFetchedSeasons] = useState<string[]>([])
  
  const [addSeasonModalOpen, setAddSeasonModalOpen] = useState(false)
  const upcoming = upcomingSeason()
  const [addingSeason, setAddingSeason] = useState(false)
  const [addSeasonError, setAddSeasonError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/seasons")
        .then(res => res.ok ? res.json() : [])
        .then(setFetchedSeasons)
        .catch(() => setFetchedSeasons([]))
  }, [])

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
        updateParams({ season: upcoming });
        setAddSeasonModalOpen(false);
    } finally {
        setAddingSeason(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={gender === "F" || gender === "M" || gender === "all" ? gender : "all"}
        onChange={(e) => updateParams({ gender: e.target.value })}
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
                updateParams({ season: e.target.value })
            }
        }}
        className="text-sm border border-border-secondary rounded-lg px-3 py-1.5 bg-background"
      >
        {fetchedSeasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value="ADD_NEW">+ New Season</option>
      </select>
      <span className="text-xs text-foreground-secondary">
        {count} athlete{count === 1 ? "" : "s"}
      </span>

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

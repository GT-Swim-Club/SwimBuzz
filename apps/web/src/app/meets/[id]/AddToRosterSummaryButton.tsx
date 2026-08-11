"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { athleteHasRosterSummaryEntry } from "@/lib/meet-signup"
import type { SheetEntry } from "@/lib/meet-sheet-summary"

type AthleteOption = { id: string; name: string }

export default function AddToRosterSummaryButton({
  meetId,
  athletes,
  rosterSummaryEntries,
}: {
  meetId: string
  athletes: AthleteOption[]
  rosterSummaryEntries: SheetEntry[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [athleteId, setAthleteId] = useState("")

  const addableAthletes = useMemo(
    () => athletes.filter((a) => !athleteHasRosterSummaryEntry(rosterSummaryEntries, a.id)),
    [athletes, rosterSummaryEntries]
  )

  function openModal() {
    setAthleteId("")
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!athleteId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/sheet-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, rosterOnly: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to add athlete")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={athletes.length === 0}
        className="text-xs px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill disabled:opacity-40 transition-colors"
      >
        Add to roster
      </button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Add to roster"
        description="Add an athlete who is attending but not swimming."
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !athleteId}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Adding…" : "Add"}
            </button>
          </ModalFooter>
        }
      >
        <div>
          <label className="block text-xs font-medium text-foreground-secondary mb-1">
            Athlete
          </label>
          <select
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            disabled={loading || addableAthletes.length === 0}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
          >
            <option value="">
              {addableAthletes.length === 0
                ? "Everyone is already on the roster summary"
                : "Select athlete…"}
            </option>
            {addableAthletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-error mt-3">{error}</p>}
      </Modal>
    </>
  )
}

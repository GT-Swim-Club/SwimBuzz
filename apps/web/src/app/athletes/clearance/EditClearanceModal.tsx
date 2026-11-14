"use client"

import { useState } from "react"
import {
  athleteDisplayName,
  CLEARANCE_CHECKS,
  formatSeasonLabel,
  type ClearanceCheck,
  type ClearanceListAthlete,
} from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"

type Draft = Record<ClearanceCheck, { cleared: boolean; date: string }>

function draftFor(athlete: ClearanceListAthlete | null): Draft {
  return {
    physical: { cleared: athlete?.physical.cleared ?? false, date: athlete?.physical.date ?? "" },
    concussion: { cleared: athlete?.concussion.cleared ?? false, date: athlete?.concussion.date ?? "" },
  }
}

/** Staff correct one athlete's clearance by hand. */
export default function EditClearanceModal({
  athlete,
  season,
  onClose,
  onSaved,
}: {
  athlete: ClearanceListAthlete | null
  season: string
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(athlete))
  const [formAthleteId, setFormAthleteId] = useState<string | null>(athlete?.athleteId ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset the form whenever a different athlete opens it.
  if ((athlete?.athleteId ?? null) !== formAthleteId) {
    setFormAthleteId(athlete?.athleteId ?? null)
    setDraft(draftFor(athlete))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!athlete) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/athletes/${athlete.athleteId}/clearance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season,
          physical: { cleared: draft.physical.cleared, date: draft.physical.date || null },
          concussion: { cleared: draft.concussion.cleared, date: draft.concussion.date || null },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Couldn't save clearance")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save clearance")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={athlete != null}
      onClose={onClose}
      closeDisabled={saving}
      title="Edit Clearance"
      description={athlete ? `${athleteDisplayName(athlete)} · ${formatSeasonLabel(season)}` : undefined}
      maxWidth="md"
      onSubmit={handleSubmit}
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </ModalFooter>
      }
    >
      <div className="space-y-3">
        {CLEARANCE_CHECKS.map((check) => (
          <div key={check} className="rounded-lg border border-border-secondary px-4 py-3">
            <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={draft[check].cleared}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [check]: { ...d[check], cleared: e.target.checked } }))
                }
                className="h-4 w-4 accent-[var(--brand-color-primary)]"
              />
              {check === "physical" ? "Physical on file" : "Concussion baseline test done"}
            </label>
            <label className="mt-2 flex items-center gap-3 pl-6">
              <span className="shrink-0 text-sm text-foreground-secondary">Date</span>
              <input
                type="date"
                value={draft[check].date}
                disabled={!draft[check].cleared}
                onChange={(e) => setDraft((d) => ({ ...d, [check]: { ...d[check], date: e.target.value } }))}
                className="min-w-0 flex-1 rounded-lg border border-border-secondary bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-border disabled:opacity-50"
              />
            </label>
          </div>
        ))}
        <p className="text-xs text-foreground-tertiary">
          Only whether each is done and when is stored — no medical details.
        </p>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </Modal>
  )
}

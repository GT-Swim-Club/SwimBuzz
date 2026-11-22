"use client"

import { useState } from "react"
import {
  athleteDisplayName,
  CLEARANCE_CHECKS,
  type ClearanceCheck,
  type ClearanceListAthlete,
} from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"

type Draft = Record<ClearanceCheck, boolean>

function draftFor(athlete: ClearanceEditTarget | null): Draft {
  return {
    physical: athlete?.physical.cleared ?? false,
    concussion: athlete?.concussion.cleared ?? false,
  }
}

/** Who the modal edits: the list row, or the athlete page's heading. */
export type ClearanceEditTarget = Pick<
  ClearanceListAthlete,
  "athleteId" | "firstName" | "lastName" | "preferredName" | "physical" | "concussion"
>

/** Staff correct one athlete's clearance (one-and-done) by hand. */
export default function EditClearanceModal({
  athlete,
  onClose,
  onSaved,
}: {
  athlete: ClearanceEditTarget | null
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
          physical: { cleared: draft.physical },
          concussion: { cleared: draft.concussion },
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
      description={athlete ? athleteDisplayName(athlete) : undefined}
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
                checked={draft[check]}
                onChange={(e) => setDraft((d) => ({ ...d, [check]: e.target.checked }))}
                className="h-4 w-4 accent-[var(--brand-color-primary)]"
              />
              {check === "physical" ? "Physical complete" : "Concussion baseline test complete"}
            </label>
          </div>
        ))}
        <p className="text-xs text-foreground-tertiary">
          Each is done once, not every season. Only whether it&apos;s done is stored — no dates or medical details.
        </p>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </Modal>
  )
}

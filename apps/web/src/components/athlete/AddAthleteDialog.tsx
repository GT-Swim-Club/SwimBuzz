"use client"

import { useState, useTransition } from "react"
import { formatSeasonLabel } from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { AppIcon } from "@/components/ui/AppIcon"
import SwimCloudIdsInput, { useSwimCloudIdsField } from "@/components/athlete/SwimCloudIdsInput"
import { addAthlete } from "@/app/athletes/AddAthleteButton.actions"

const LABEL = "mb-1 block text-xs font-medium text-foreground-secondary"
const INPUT =
  "w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated"

export type AddedAthlete = { id: string; firstName: string; lastName: string; seasons: string[] }

type Gender = "M" | "F"

const EMPTY_FORM = { firstName: "", lastName: "", preferredName: "", email: "", gender: "" as Gender | "" }

/**
 * The Add athlete form, adding one athlete to `season`'s roster: from the roster's + menu, or
 * prefilled with a results name from the "Pair unmatched athletes" dialog. Each open starts from
 * `initial`.
 */
export default function AddAthleteDialog({
  open,
  onClose,
  season,
  initial,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  season: string
  initial?: { firstName?: string; lastName?: string; gender?: Gender | null }
  onAdded?: (athlete: AddedAthlete) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const swimCloud = useSwimCloudIdsField()

  // Each open starts fresh from `initial` (set while rendering, so the first frame is already filled).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm({
        ...EMPTY_FORM,
        firstName: initial?.firstName ?? "",
        lastName: initial?.lastName ?? "",
        gender: initial?.gender ?? "",
      })
      swimCloud.reset()
      setError(null)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!swimCloud.valid || !form.gender) return
    const gender = form.gender
    setError(null)

    startTransition(async () => {
      try {
        const athlete = await addAthlete({
          firstName: form.firstName,
          lastName: form.lastName,
          preferredName: form.preferredName,
          email: form.email,
          swimCloudIds: swimCloud.allIds,
          gender,
          seasons: [season],
        })
        onAdded?.({
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          seasons: athlete.seasons,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add athlete")
      }
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={isPending}
      title="Add athlete"
      description={`Adds to the ${formatSeasonLabel(season)} roster.`}
      maxWidth="md"
      onSubmit={handleSubmit}
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !swimCloud.valid || !form.gender}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
          >
            {isPending ? "Adding…" : "Add athlete"}
          </button>
        </ModalFooter>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="add-athlete-first" className={LABEL}>
            First name <span className="text-error">*</span>
          </label>
          <input
            id="add-athlete-first"
            required
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="add-athlete-last" className={LABEL}>
            Last name <span className="text-error">*</span>
          </label>
          <input
            id="add-athlete-last"
            required
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            className={INPUT}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="add-athlete-preferred" className={LABEL}>
            Preferred name
          </label>
          <input
            id="add-athlete-preferred"
            type="text"
            value={form.preferredName}
            onChange={(e) => setForm((f) => ({ ...f, preferredName: e.target.value }))}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="add-athlete-gender" className={LABEL}>
            Gender <span className="text-error">*</span>
          </label>
          <div className="relative">
            <select
              id="add-athlete-gender"
              required
              value={form.gender}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as Gender | "" }))}
              className={`${INPUT} appearance-none pr-9 ${form.gender ? "" : "text-foreground-tertiary"}`}
            >
              <option value="" disabled>
                Choose…
              </option>
              <option value="F">Women</option>
              <option value="M">Men</option>
            </select>
            <AppIcon
              name="chevronDown"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-tertiary"
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="add-athlete-email" className={LABEL}>
          Email <span className="text-error">*</span>
        </label>
        <input
          id="add-athlete-email"
          required
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="add-swimcloud-ids" className={LABEL}>
          SwimCloud ID/URL
        </label>
        <SwimCloudIdsInput field={swimCloud} id="add-swimcloud-ids" />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
    </Modal>
  )
}

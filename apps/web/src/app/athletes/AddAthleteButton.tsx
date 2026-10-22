"use client"

import { useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { currentSeason, parseSeason } from "@/lib/season"
import { formatSeasonLabel } from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import HoverDetail from "@/components/ui/HoverDetail"
import SwimCloudIdsInput, { useSwimCloudIdsField } from "@/components/athlete/SwimCloudIdsInput"
import { addAthlete } from "./AddAthleteButton.actions"

export default function AddAthleteButton() {
  const searchParams = useSearchParams()

  const gender = searchParams.get("gender") === "F" ? "F" : "M"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const loading = isPending
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    preferredName: "",
  })
  const swimCloud = useSwimCloudIdsField()

  function openModal() {
    setError(null)
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!swimCloud.valid) return
    setError(null)

    startTransition(async () => {
      try {
        await addAthlete({
          ...form,
          swimCloudIds: swimCloud.allIds,
          gender,
          seasons: [season],
        })
        setForm({
          firstName: "",
          lastName: "",
          email: "",
          preferredName: "",
        })
        swimCloud.reset()
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add athlete")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Add athlete"
        className="group relative inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-contrast transition-colors hover:bg-primary-hover"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <HoverDetail label="Add athlete" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Add athlete"
        description={`Adds to the ${gender === "F" ? "Women" : "Men"} ${formatSeasonLabel(season)} roster.`}
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !swimCloud.valid}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Adding…" : "Add athlete"}
            </button>
          </ModalFooter>
        }
      >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-foreground-secondary dark:text-foreground-secondary mb-1">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated dark:border border-border-secondary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-secondary dark:text-foreground-secondary mb-1">
                    Last name <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated dark:border border-border-secondary"
                  />
                </div>
              </div>

              <div>
                  <label className="block text-xs font-medium text-foreground-secondary dark:text-foreground-secondary mb-1">
                  Preferred name
                </label>
                <input
                  type="text"
                  value={form.preferredName}
                  onChange={(e) => setForm((f) => ({ ...f, preferredName: e.target.value }))}
                  className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated dark:border border-border-secondary"
                />
              </div>

              <div>
                  <label className="block text-xs font-medium text-foreground-secondary dark:text-foreground-secondary mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated dark:border border-border-secondary"
                />
              </div>

              <div>
                <label
                  htmlFor="add-swimcloud-ids"
                  className="block text-xs font-medium text-foreground-secondary mb-1"
                >
                  SwimCloud ID/URL
                </label>
                <SwimCloudIdsInput field={swimCloud} id="add-swimcloud-ids" />
              </div>

        {error && (
          <p className="text-sm text-error dark:text-error">{error}</p>
        )}
      </Modal>
    </>
  )
}

"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { currentSeason, parseSeason } from "@/lib/season"
import Modal, { ModalFooter } from "@/components/Modal"
import NicknameTagsInput from "@/components/NicknameTagsInput"
import {
  isValidSwimCloudIdInput,
  SWIMCLOUD_ID_ERROR,
  SWIMCLOUD_ID_MAX_LENGTH,
} from "@/lib/swimcloud-id"

export default function AddAthleteButton() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const gender = searchParams.get("gender") === "F" ? "F" : "M"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    swimCloudId: "",
    nicknames: [] as string[],
  })

  function openModal() {
    setError(null)
    setOpen(true)
  }

  const swimCloudIdOk =
    form.swimCloudId === "" || isValidSwimCloudIdInput(form.swimCloudId)
  const showSwimCloudHint =
    form.swimCloudId.length > 0 && !isValidSwimCloudIdInput(form.swimCloudId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!swimCloudIdOk) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          gender,
          seasons: [season],
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to add athlete")
        return
      }

      setForm({ firstName: "", lastName: "", email: "", swimCloudId: "", nicknames: [] })
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
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-text hover:bg-primary-hover transition-colors"
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
        Add athlete
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Add athlete"
        description={`Adds to the ${gender === "F" ? "Women" : "Men"} ${season} roster.`}
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
              disabled={loading || !swimCloudIdOk}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
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
                  <label className="block text-xs font-medium text-foreground-secondary dark:text-foreground-secondary mb-1">
                  SwimCloud ID
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern={`\\d{6,${SWIMCLOUD_ID_MAX_LENGTH}}`}
                  maxLength={SWIMCLOUD_ID_MAX_LENGTH}
                  placeholder="e.g. 1234567"
                  title={SWIMCLOUD_ID_ERROR}
                  value={form.swimCloudId}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      swimCloudId: e.target.value
                        .replace(/\D/g, "")
                        .slice(0, SWIMCLOUD_ID_MAX_LENGTH),
                    }))
                  }
                  className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated dark:border border-border-secondary"
                  aria-invalid={showSwimCloudHint}
                  aria-describedby={showSwimCloudHint ? "add-swimcloud-id-hint" : undefined}
                />
                {showSwimCloudHint && (
                  <p
                    id="add-swimcloud-id-hint"
                    className="mt-1 text-xs text-amber-600 dark:text-amber-400"
                  >
                    {SWIMCLOUD_ID_ERROR} ({form.swimCloudId.length}/{SWIMCLOUD_ID_MAX_LENGTH})
                  </p>
                )}
              </div>

              <div>
                  <label className="block text-xs font-medium text-foreground-secondary dark:text-foreground-secondary mb-1">
                  Alternate names
                </label>
                <NicknameTagsInput
                  value={form.nicknames}
                  onChange={(nicknames) => setForm((f) => ({ ...f, nicknames }))}
                  disabled={loading}
                  showAddButton
                  placeholder="Add alternate name"
                />
                <p className="mt-1 text-xs text-foreground-tertiary dark:text-foreground-tertiary">
                  Names used to match results to this athlete.
                </p>
              </div>

        {error && (
          <p className="text-sm text-error dark:text-error">{error}</p>
        )}
      </Modal>
    </>
  )
}

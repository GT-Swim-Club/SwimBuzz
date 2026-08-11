"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import NicknameTagsInput from "@/components/NicknameTagsInput"
import ActionIcon from "@/components/ActionIcon"
import {
  isValidSwimCloudIdInput,
  SWIMCLOUD_ID_ERROR,
  SWIMCLOUD_ID_MAX_LENGTH,
} from "@/lib/swimcloud-id"

type AthleteActionsProps = {
  athleteId: string
  firstName: string
  lastName: string
  email: string
  swimCloudId: number | null
  nicknames: string[]
}

export default function AthleteActions({
  athleteId,
  firstName,
  lastName,
  email,
  swimCloudId,
  nicknames,
}: AthleteActionsProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName,
    lastName,
    email,
    swimCloudId: swimCloudId?.toString() ?? "",
    nicknames,
  })

  function openEdit() {
    setForm({
      firstName,
      lastName,
      email,
      swimCloudId: swimCloudId?.toString() ?? "",
      nicknames,
    })
    setError(null)
    setEditing(true)
  }

  const swimCloudIdOk =
    form.swimCloudId === "" || isValidSwimCloudIdInput(form.swimCloudId)
  const showSwimCloudHint =
    form.swimCloudId.length > 0 && !isValidSwimCloudIdInput(form.swimCloudId)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!swimCloudIdOk) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          swimCloudId: form.swimCloudId === "" ? null : form.swimCloudId,
          nicknames: form.nicknames,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save changes")
        return
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Failed to delete athlete")
        setLoading(false)
        return
      }
      router.push("/athletes")
      router.refresh()
    } catch {
      setError("Something went wrong")
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={openEdit}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-lg bg-fill-secondary hover:bg-fill-secondary dark:hover:bg-zinc-800 transition-colors sm:py-1.5"
        >
          <ActionIcon kind="edit" className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirmDelete(true)
          }}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 border border-border-secondary border-red-200 text-error rounded-lg hover:bg-red-50 dark:border-red-900/50 dark:text-error dark:hover:bg-red-950/40 transition-colors sm:py-1.5"
        >
          <ActionIcon kind="delete" className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        closeDisabled={loading}
        title="Edit athlete"
        maxWidth="md"
        onSubmit={handleSave}
        footer={
          <ModalFooter>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={loading}
                className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border border-border-secondary"
              >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !swimCloudIdOk}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save changes"}
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
            className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Last name <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
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
            className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary"
            aria-invalid={showSwimCloudHint}
            aria-describedby={showSwimCloudHint ? "edit-swimcloud-id-hint" : undefined}
          />
          {showSwimCloudHint && (
            <p
              id="edit-swimcloud-id-hint"
              className="mt-1 text-xs text-amber-600 dark:text-amber-400"
            >
              {SWIMCLOUD_ID_ERROR} ({form.swimCloudId.length}/{SWIMCLOUD_ID_MAX_LENGTH})
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Alternate names
          </label>
          <NicknameTagsInput
            value={form.nicknames}
            onChange={(nicknames) => setForm((f) => ({ ...f, nicknames }))}
            disabled={loading}
            showAddButton
            placeholder="Add alternate name"
          />
          <p className="mt-1 text-xs text-foreground-tertiary">
            Names used to match imported results to this athlete.
          </p>
        </div>

        {error && <p className="text-sm text-error dark:text-error">{error}</p>}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={loading}
        title="Delete athlete"
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary hover:bg-fill-secondary border-border-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Deleting…" : "Delete"}
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-foreground-secondary text-foreground-secondary">
          Permanently delete <span className="font-medium">{firstName} {lastName}</span> and all
          of their swim records? This cannot be undone.
        </p>
        {error && <p className="text-sm text-error dark:text-error">{error}</p>}
      </Modal>
    </>
  )
}

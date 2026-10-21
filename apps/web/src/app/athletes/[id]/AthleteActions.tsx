"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { ICON_BUTTON, ICON_BUTTON_DANGER, SwimCloudProfileLink } from "./AthleteIconButton"
import {
  isValidSwimCloudIdInput,
  normalizeSwimCloudIdInput,
  SWIMCLOUD_ID_ERROR,
} from "@/lib/swim/swimcloud-id"
import { updateAthlete, deleteAthlete } from "./athlete.actions"

type AthleteActionsProps = {
  athleteId: string
  firstName: string
  lastName: string
  email: string
  swimCloudId: number | null
  preferredName: string | null
  gtid: string | null
  /** "YYYY-MM-DD", the Eastern calendar day it's stored on. */
  dob: string | null
}

const GTID_LENGTH = 9
const GTID_ERROR = "GTID must be 9 digits starting with 90"

export default function AthleteActions({
  athleteId,
  firstName,
  lastName,
  email,
  swimCloudId,
  preferredName,
  gtid,
  dob,
}: AthleteActionsProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const loading = isPending
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName,
    lastName,
    email,
    swimCloudId: swimCloudId?.toString() ?? "",
    preferredName: preferredName ?? "",
    gtid: gtid ?? "",
    dob: dob ?? "",
  })

  function openEdit() {
    setForm({
      firstName,
      lastName,
      email,
      swimCloudId: swimCloudId?.toString() ?? "",
      preferredName: preferredName ?? "",
      gtid: gtid ?? "",
      dob: dob ?? "",
    })
    setError(null)
    setEditing(true)
  }

  const swimCloudIdOk =
    form.swimCloudId === "" || isValidSwimCloudIdInput(form.swimCloudId)
  const showSwimCloudHint =
    form.swimCloudId.length > 0 && !isValidSwimCloudIdInput(form.swimCloudId)
  const gtidOk = form.gtid === "" || /^90\d{7}$/.test(form.gtid)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!swimCloudIdOk || !gtidOk) return
    setError(null)
    startTransition(async () => {
      try {
        await updateAthlete(athleteId, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          swimCloudId: form.swimCloudId === "" ? null : form.swimCloudId,
          preferredName: form.preferredName,
          gtid: form.gtid === "" ? null : form.gtid,
          dob: form.dob === "" ? null : form.dob,
        })
        setEditing(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save changes")
      }
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteAthlete(athleteId)
        router.push("/athletes")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete athlete")
      }
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {swimCloudId != null && <SwimCloudProfileLink swimCloudId={swimCloudId} />}
        <button
          type="button"
          onClick={openEdit}
          aria-label="Edit athlete"
          className={`${ICON_BUTTON} h-9 w-9`}
        >
          <ActionIcon kind="edit" className="h-5 w-5" />
          <HoverDetail label="Edit athlete" />
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirmDelete(true)
          }}
          aria-label="Delete athlete"
          className={`${ICON_BUTTON_DANGER} h-9 w-9`}
        >
          <ActionIcon kind="delete" className="h-5 w-5" />
          <HoverDetail label="Delete athlete" />
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
              disabled={loading || !swimCloudIdOk || !gtidOk}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">GTID</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={GTID_LENGTH}
              placeholder="e.g. 903123456"
              title={GTID_ERROR}
              value={form.gtid}
              onChange={(e) =>
                setForm((f) => ({ ...f, gtid: e.target.value.replace(/\D/g, "").slice(0, GTID_LENGTH) }))
              }
              className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
              aria-invalid={!gtidOk}
              aria-describedby={!gtidOk ? "edit-gtid-hint" : undefined}
            />
            {!gtidOk && (
              <p id="edit-gtid-hint" className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {GTID_ERROR}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">Date of birth</label>
            <input
              type="date"
              value={form.dob}
              onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
              className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            SwimCloud ID or URL
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1234567"
            title={SWIMCLOUD_ID_ERROR}
            value={form.swimCloudId}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                swimCloudId: normalizeSwimCloudIdInput(e.target.value),
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
              {SWIMCLOUD_ID_ERROR}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Preferred name
          </label>
          <input
            type="text"
            placeholder="Optional"
            value={form.preferredName}
            onChange={(e) => setForm((f) => ({ ...f, preferredName: e.target.value }))}
            className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary"
          />
          <p className="mt-1 text-xs text-foreground-tertiary">
            Shown in place of their first name, and used to match imported results to this athlete.
          </p>
        </div>

        {error && <p className="text-sm text-error dark:text-error">{error}</p>}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={loading}
        title="Delete athlete"
        description={
          <>
            Permanently delete <span className="font-medium">{firstName} {lastName}</span> and all
            of their swim records? This cannot be undone.
          </>
        }
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
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Deleting…" : "Delete"}
            </button>
          </ModalFooter>
        }
      >
        {error && <p className="text-sm text-error dark:text-error">{error}</p>}
      </Modal>
    </>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { ICON_BUTTON, ICON_BUTTON_DANGER, SwimCloudProfileLinks } from "./AthleteIconButton"
import SwimCloudIdsInput, { useSwimCloudIdsField } from "@/components/athlete/SwimCloudIdsInput"
import { updateAthlete, deleteAthlete } from "./athlete.actions"
import { athletePath } from "@/lib/slug"
import { buildFullPath, carryBackTarget } from "@/lib/navigation-history"

type AthleteActionsProps = {
  athleteId: string
  firstName: string
  lastName: string
  email: string
  swimCloudIds: number[]
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
  swimCloudIds,
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
    preferredName: preferredName ?? "",
    gtid: gtid ?? "",
    dob: dob ?? "",
  })
  const swimCloud = useSwimCloudIdsField(swimCloudIds)

  function openEdit() {
    setForm({
      firstName,
      lastName,
      email,
      preferredName: preferredName ?? "",
      gtid: gtid ?? "",
      dob: dob ?? "",
    })
    swimCloud.reset(swimCloudIds)
    setError(null)
    setEditing(true)
  }

  const gtidOk = form.gtid === "" || /^90\d{7}$/.test(form.gtid)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!swimCloud.valid || !gtidOk) return
    setError(null)
    startTransition(async () => {
      try {
        const updated = await updateAthlete(athleteId, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          swimCloudIds: swimCloud.allIds,
          preferredName: form.preferredName,
          gtid: form.gtid === "" ? null : form.gtid,
          dob: form.dob === "" ? null : form.dob,
        })
        setEditing(false)
        // A name change produces a new slug. router.replace swaps the current history entry (so
        // Back still returns to the previous page) and soft-navigates, fetching fresh data.
        if (updated.slug && athletePath(updated.slug) !== window.location.pathname) {
          const search = window.location.search.replace(/^\?/, "")
          const nextPath = buildFullPath(athletePath(updated.slug), search)
          carryBackTarget(buildFullPath(window.location.pathname, search), nextPath)
          router.replace(nextPath)
        }
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
        <SwimCloudProfileLinks swimCloudIds={swimCloudIds} />
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
              disabled={loading || !swimCloud.valid || !gtidOk}
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
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Preferred name
          </label>
          <input
            type="text"
            value={form.preferredName}
            onChange={(e) => setForm((f) => ({ ...f, preferredName: e.target.value }))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
          />
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
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/35"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="edit-swimcloud-ids"
            className="block text-xs font-medium text-foreground-secondary mb-1"
          >
            SwimCloud ID/URL
          </label>
          <SwimCloudIdsInput field={swimCloud} id="edit-swimcloud-ids" />
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

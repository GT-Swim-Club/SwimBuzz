"use client"

import { useState, useTransition } from "react"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { useRouter } from "next/navigation"
import { type MeetFormState } from "../MeetFields"
import MeetFormModal from "../MeetFormModal"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { meetPath } from "@/lib/slug"
import { useUnsavedUploads } from "@/lib/meet/unsaved-uploads"
import { deleteMeetEntirely, updateMeet } from "./meet-update.actions"

function meetImageUrls(form: Pick<MeetFormState, "iconUrl" | "bannerUrl">) {
  return [form.iconUrl, form.bannerUrl]
}


export default function MeetActions({
  meetId,
  meetSlug,
  initial,
  meetName,
  hasSwims,
}: {
  meetId: string
  meetSlug: string | null
  initial: MeetFormState
  meetName: string
  hasSwims: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteOption, setDeleteOption] = useState<"meet" | "swims" | "both">("both")
  const [isPending, startTransition] = useTransition()
  const loading = isPending
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<MeetFormState>(initial)
  const { begin, trackUpload, release } = useUnsavedUploads()

  function closeWithoutSaving() {
    if (loading) return
    release(meetImageUrls(initial))
    setEditing(false)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const result = await updateMeet(meetId, form)
        if (!result.ok) {
          setError(result.error)
          return
        }
        release(meetImageUrls(form))
        setEditing(false)
        const nextSlug = result.meet.slug
        if (nextSlug && nextSlug !== meetSlug) {
          router.replace(meetPath(nextSlug))
        }
      } catch {
        setError("Something went wrong")
      }
    })
  }

  function handleDelete(options: { deleteMeet: boolean, deleteSwims: boolean }) {
    setError(null)
    startTransition(async () => {
      try {
        await deleteMeetEntirely(meetId, options)
        if (options.deleteMeet) {
          router.push("/meets")
        } else {
          setConfirmDelete(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete")
      }
    })
  }

  return (
    <>
      <div className="flex shrink-0 flex-nowrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            begin()
            setForm(initial)
            setError(null)
            setEditing(true)
          }}
          aria-label="Edit meet"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors"
        >
          <ActionIcon kind="edit" className="h-5 w-5" />
          <HoverDetail label="Edit meet" />
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirmDelete(true)
          }}
          aria-label="Move meet to Trash"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-error-border text-error rounded-lg bg-background hover:bg-error-bg transition-colors"
        >
          <ActionIcon kind="delete" className="h-5 w-5" />
          <HoverDetail label="Move to Trash" />
        </button>
      </div>

      <MeetFormModal
        open={editing}
        title="Edit meet"
        form={form}
        setForm={setForm}
        onUploaded={trackUpload}
        onClose={closeWithoutSaving}
        onSubmit={handleSave}
        loading={loading}
        busy={loading}
        submitLabel="Save changes"
        loadingLabel="Saving…"
        error={error}
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={loading}
        title={deleteOption === "swims" ? `Delete swims from ${meetName}?` : `Move ${meetName} to Trash?`}
        description={deleteOption === "swims" ? "Swims-only deletion is permanent and cannot be undone." : "Move this meet to Trash."}
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={loading}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-fill border-border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => 
                handleDelete({
                  deleteMeet: deleteOption === "meet" || deleteOption === "both",
                  deleteSwims: deleteOption === "swims" || deleteOption === "both",
                })
              }
              disabled={loading}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
            >
              {deleteOption === "swims"
                ? loading ? "Deleting…" : "Delete"
                : loading ? "Moving…" : "Move to Trash"}
            </button>
          </ModalFooter>
        }
      >
        {hasSwims ? (
          <div className="space-y-2">
            {([
              { value: "meet", label: "Move to Trash", desc: "Moves meet to Trash; keeps swims in athlete stats" },
              { value: "swims", label: "Delete swims", desc: "Permanently deletes associated swims; keeps meet" },
              { value: "both", label: "Move meet and swims to Trash", desc: "Moves meet and swims to Trash; hides swims from stats" },
            ] as const).map((opt) => (
              <label key={opt.value} className="flex items-center gap-3 p-3 border border-border-secondary rounded-lg cursor-pointer hover:bg-fill">
                <input
                  type="radio"
                  name="deleteOption"
                  checked={deleteOption === opt.value}
                  onChange={() => setDeleteOption(opt.value)}
                  className="accent-red-600"
                />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-foreground-tertiary">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        ) : null}
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

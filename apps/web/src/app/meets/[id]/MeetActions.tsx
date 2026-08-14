"use client"

import { useState } from "react"
import ActionIcon from "@/components/ActionIcon"
import HoverDetail from "@/components/HoverDetail"
import { useRouter } from "next/navigation"
import MeetFields, { type MeetFormState } from "../MeetFields"
import Modal, { ModalFooter } from "@/components/Modal"
import { meetPath } from "@/lib/slug"
import { useUnsavedUploads } from "@/lib/unsaved-uploads"

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<MeetFormState>(initial)
  const { begin, trackUpload, release } = useUnsavedUploads()

  function closeWithoutSaving() {
    if (loading) return
    release(meetImageUrls(initial))
    setEditing(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save changes")
        return
      }
      release(meetImageUrls(form))
      setEditing(false)
      const nextSlug = data.slug as string | null | undefined
      if (nextSlug && nextSlug !== meetSlug) {
        router.replace(meetPath(nextSlug))
      } else {
        router.refresh()
      }
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(options: { deleteMeet: boolean, deleteSwims: boolean }) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}`, { 
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Failed to delete")
        setLoading(false)
        return
      }
      if (options.deleteMeet) {
        router.push("/meets")
      } else {
        router.refresh()
        setConfirmDelete(false)
      }
      setLoading(false)
    } catch {
      setError("Something went wrong")
      setLoading(false)
    }
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
          className="group relative inline-flex shrink-0 items-center justify-center p-2 border border-border rounded-lg bg-background hover:bg-fill transition-colors"
        >
          <ActionIcon kind="edit" className="h-4 w-4" />
          <HoverDetail label="Edit meet" />
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirmDelete(true)
          }}
          aria-label="Delete meet"
          className="group relative inline-flex shrink-0 items-center justify-center p-2 border border-red-200 text-error rounded-lg bg-background hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/40 transition-colors"
        >
          <ActionIcon kind="delete" className="h-4 w-4" />
          <HoverDetail label="Delete meet" />
        </button>
      </div>

      <Modal
        open={editing}
        onClose={closeWithoutSaving}
        closeDisabled={loading}
        busy={loading}
        title="Edit meet"
        onSubmit={handleSave}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeWithoutSaving}
              disabled={loading}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-fill border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </ModalFooter>
        }
      >
        <MeetFields form={form} setForm={setForm} onUploaded={trackUpload} />
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={loading}
        title={`Delete ${meetName}?`}
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
              {loading ? "Deleting…" : "Delete"}
            </button>
          </ModalFooter>
        }
      >
   <p className="text-sm text-foreground-secondary">
            This cannot be undone.
          </p>
        {hasSwims ? (
          <div className="space-y-2">
            {([
              { value: "meet", label: `Delete meet`, desc: "Keeps swims, disconnects from meet" },
              { value: "swims", label: "Delete swims", desc: "Deletes associated swims, keeps meet" },
              { value: "both", label: "Delete both", desc: "Deletes meet and associated swims" },
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

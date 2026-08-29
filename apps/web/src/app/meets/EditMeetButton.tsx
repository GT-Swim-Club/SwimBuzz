"use client"

import { useState, useTransition } from "react"
import MeetFields, { type MeetFormState } from "./MeetFields"
import Modal, { ModalFooter } from "@/components/Modal"
import ActionIcon from "@/components/ActionIcon"
import { useUnsavedUploads } from "@/lib/unsaved-uploads"
import { updateMeet } from "./[id]/meet-update.actions"

function meetImageUrls(form: Pick<MeetFormState, "iconUrl" | "bannerUrl">) {
  return [form.iconUrl, form.bannerUrl]
}

export default function EditMeetButton({
  meetId,
  initial,
  seasons
}: {
  meetId: string
  initial: MeetFormState
  seasons: string[]
}) {
  const [editing, setEditing] = useState(false)
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
      } catch {
        setError("Something went wrong")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          begin()
          setForm(initial)
          setError(null)
          setEditing(true)
        }}
        className="text-foreground-secondary hover:text-primary transition-colors"
        aria-label="Edit meet"
      >
        <ActionIcon kind="edit" className="h-4 w-4" />
      </button>

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
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.name.trim() || !form.startDate || !form.course || !form.season || Boolean(form.endDate && form.endDate < form.startDate)}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </ModalFooter>
        }
      >
        <MeetFields form={form} setForm={setForm} initialSeasons={seasons} onUploaded={trackUpload} />
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

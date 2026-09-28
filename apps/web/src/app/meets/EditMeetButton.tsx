"use client"

import { useState, useTransition } from "react"
import { type MeetFormState } from "./MeetFields"
import MeetFormModal from "./MeetFormModal"
import ActionIcon from "@/components/ui/ActionIcon"
import { useUnsavedUploads } from "@/lib/meet/unsaved-uploads"
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

      <MeetFormModal
        open={editing}
        title="Edit meet"
        form={form}
        setForm={setForm}
        seasons={seasons}
        onUploaded={trackUpload}
        onClose={closeWithoutSaving}
        onSubmit={handleSave}
        loading={loading}
        busy={loading}
        submitLabel="Save changes"
        loadingLabel="Saving…"
        error={error}
      />
    </>
  )
}

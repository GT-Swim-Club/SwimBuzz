"use client"

import { useState, useTransition } from "react"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { useRouter } from "next/navigation"
import { type MeetFormState } from "../MeetFields"
import MeetFormModal from "../MeetFormModal"
import { meetPath } from "@/lib/slug"
import { useUnsavedUploads } from "@/lib/meet/unsaved-uploads"
import { updateMeet } from "./meet-update.actions"
import DeleteMeetModal from "./DeleteMeetModal"

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

  function handleDeleted({ meetDeleted }: { meetDeleted: boolean }) {
    if (meetDeleted) {
      // Deleted from the edit modal: its edits are never saved, so drop any
      // images uploaded this session and keep only the meet's saved ones.
      release(meetImageUrls(initial))
      router.push("/meets")
    } else {
      setConfirmDelete(false)
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
        onDelete={() => setConfirmDelete(true)}
      />

      <DeleteMeetModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        meetId={meetId}
        meetName={meetName}
        hasSwims={hasSwims}
        onDeleted={handleDeleted}
      />
    </>
  )
}

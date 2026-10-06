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
        title={hasSwims ? `Remove ${meetName}?` : `Move ${meetName} to Trash?`}
        description={hasSwims ? undefined : "You can restore it from Trash later."}
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
              className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-error-hover disabled:opacity-50"
            >
              {deleteOption === "swims"
                ? loading ? "Deleting…" : "Delete swims"
                : loading ? "Moving…" : "Move to Trash"}
            </button>
          </ModalFooter>
        }
      >
        {hasSwims ? (
          <div role="radiogroup" aria-label="What to remove" className="space-y-2">
            {([
              { value: "both", label: "Meet and swims", desc: "Both go to Trash." },
              { value: "meet", label: "Meet only", desc: "Meet goes to Trash. Swims stay in athlete stats." },
              { value: "swims", label: "Swims only", desc: "Deletes this meet's swims. The meet stays.", permanent: true },
            ] as const).map((opt) => {
              const selected = deleteOption === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-error-border ${
                    selected ? "border-error bg-error-bg" : "border-border-secondary hover:bg-fill"
                  }`}
                >
                  <input
                    type="radio"
                    name="deleteOption"
                    checked={selected}
                    onChange={() => setDeleteOption(opt.value)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      selected ? "border-error" : "border-foreground-tertiary"
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-error" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {opt.label}
                      {"permanent" in opt && (
                        <span className="rounded px-1.5 py-px text-[11px] font-medium text-error ring-1 ring-error-border">
                          Permanent
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-foreground-tertiary">{opt.desc}</span>
                  </span>
                </label>
              )
            })}
          </div>
        ) : null}
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

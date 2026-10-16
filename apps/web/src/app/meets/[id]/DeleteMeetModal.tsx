"use client"

import { useState, useTransition } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { deleteMeetEntirely } from "./meet-update.actions"

type DeleteOption = "meet" | "swims" | "both"

/**
 * "Move to Trash?" confirmation for a meet — shared by the meet page's delete
 * button and the edit-meet modal's. A meet with swims asks what to remove
 * (meet and swims, meet only, or swims only).
 */
export default function DeleteMeetModal({
  open,
  onClose,
  meetId,
  meetName,
  hasSwims,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  meetId: string
  meetName: string
  hasSwims: boolean
  /** After a successful delete; `meetDeleted` is false when only its swims were removed. */
  onDeleted: (result: { meetDeleted: boolean }) => void
}) {
  const [deleteOption, setDeleteOption] = useState<DeleteOption>("both")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClose() {
    setError(null)
    onClose()
  }

  function handleDelete() {
    const options = {
      deleteMeet: deleteOption === "meet" || deleteOption === "both",
      deleteSwims: deleteOption === "swims" || deleteOption === "both",
    }
    setError(null)
    startTransition(async () => {
      try {
        await deleteMeetEntirely(meetId, options)
        onDeleted({ meetDeleted: options.deleteMeet })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete")
      }
    })
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeDisabled={isPending}
      title={`Remove ${meetName}?`}
      description={hasSwims ? undefined : "You can restore it from Trash later."}
      maxWidth="sm"
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-fill border-border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-error-hover disabled:opacity-50"
          >
            {deleteOption === "swims" && hasSwims
              ? isPending ? "Deleting…" : "Delete swims"
              : isPending ? "Moving…" : "Move to Trash"}
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
  )
}

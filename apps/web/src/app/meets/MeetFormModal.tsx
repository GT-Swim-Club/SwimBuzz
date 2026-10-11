"use client"

import { useState } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import MeetFields, { MeetImageHeader, type MeetFormState } from "./MeetFields"

export function meetFormComplete(form: MeetFormState) {
  return Boolean(
    form.name.trim() &&
      form.startDate &&
      form.course &&
      form.season &&
      !(form.endDate && form.endDate < form.startDate)
  )
}

/**
 * Create/edit meet dialog: banner + icon header, meet fields, Cancel / submit
 * footer. Pass `onDelete` (edit only) for a small Move-to-Trash icon button at
 * the footer's start; it should open DeleteMeetModal, which stacks on top.
 */
export default function MeetFormModal({
  open,
  title,
  form,
  setForm,
  seasons,
  onUploaded,
  onClose,
  onSubmit,
  loading,
  busy = false,
  submitLabel,
  loadingLabel,
  error,
  onDelete,
}: {
  open: boolean
  title: string
  form: MeetFormState
  setForm: React.Dispatch<React.SetStateAction<MeetFormState>>
  seasons?: string[]
  onUploaded?: (url: string) => void
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  loading: boolean
  busy?: boolean
  submitLabel: string
  loadingLabel: string
  error: string | null
  onDelete?: () => void
}) {
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)

  function handleClose() {
    setImageError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeDisabled={loading}
      busy={busy}
      top={
        <MeetImageHeader
          title={title}
          form={form}
          setForm={setForm}
          onUploaded={onUploaded}
          onError={setImageError}
          onUploadingChange={setImageUploading}
        />
      }
      bodyClassName="!pt-11 sm:!pb-5"
      onSubmit={onSubmit}
      footer={
        <ModalFooter>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={loading}
              aria-label="Move meet to Trash"
              className="group relative inline-flex w-10 shrink-0 items-center justify-center self-stretch rounded-lg border border-error-border text-error transition-colors hover:bg-error-bg disabled:opacity-50"
            >
              <ActionIcon kind="delete" className="h-4 w-4" />
              <HoverDetail label="Move to Trash" />
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-fill"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || imageUploading || !meetFormComplete(form)}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? loadingLabel : imageUploading ? "Uploading image…" : submitLabel}
          </button>
        </ModalFooter>
      }
    >
      <MeetFields form={form} setForm={setForm} initialSeasons={seasons} />
      {imageError && <p className="text-sm text-error">{imageError}</p>}
      {error && <p className="text-sm text-error">{error}</p>}
    </Modal>
  )
}

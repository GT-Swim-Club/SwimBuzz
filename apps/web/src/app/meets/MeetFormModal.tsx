"use client"

import { useState } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
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

/** Create/edit meet dialog: banner + icon header, meet fields, Cancel / submit footer. */
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
}) {
  const [imageError, setImageError] = useState<string | null>(null)

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
          onClose={handleClose}
          closeDisabled={loading}
          onError={setImageError}
        />
      }
      bodyClassName="!pt-11 sm:!pb-5"
      onSubmit={onSubmit}
      footer={
        <ModalFooter>
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
            disabled={loading || !meetFormComplete(form)}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? loadingLabel : submitLabel}
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

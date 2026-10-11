"use client"

import type { ReactNode } from "react"
import { useState, useTransition } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { resourceInputClass } from "@/components/meet/ResourceRows"
import { updateMeet } from "./meet-update.actions"

/** Coach dialog for the meet's external sign-up form link (`Meet.signupUrl`). */
export default function EditSignupLinkButton({
  meetId,
  initial,
  trigger,
}: {
  meetId: string
  initial: string
  trigger: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState(initial)

  function openDialog() {
    setUrl(initial)
    setError(null)
    setOpen(true)
  }

  function close() {
    if (isPending) return
    setOpen(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = url.trim()
    if (next && !/^https?:\/\//i.test(next)) {
      setError("Enter a full link starting with https://")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await updateMeet(meetId, { signupUrl: next || null })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setOpen(false)
      } catch {
        setError("Something went wrong")
      }
    })
  }

  return (
    <>
      {trigger(openDialog)}
      <Modal
        open={open}
        onClose={close}
        closeDisabled={isPending}
        busy={isPending}
        title={initial ? "Edit sign-up link" : "Add sign-up link"}
        description="Paste the link to the sign-up form (e.g. a Google Form). Members open it from this meet."
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://forms.gle/…"
          aria-label="Sign-up link"
          autoFocus
          className={resourceInputClass}
        />
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

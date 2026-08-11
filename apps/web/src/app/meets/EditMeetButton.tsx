"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import MeetFields, { type MeetFormState } from "./MeetFields"
import Modal, { ModalFooter } from "@/components/Modal"
import ActionIcon from "@/components/ActionIcon"

export default function EditMeetButton({
  meetId,
  initial,
  seasons
}: {
  meetId: string
  initial: MeetFormState
  seasons: string[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<MeetFormState>(initial)

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
      setEditing(false)
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
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
        onClose={() => setEditing(false)}
        closeDisabled={loading}
        busy={loading}
        title="Edit meet"
        onSubmit={handleSave}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.name.trim() || !form.startDate || !form.course || !form.season}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </ModalFooter>
        }
      >
        <MeetFields form={form} setForm={setForm} initialSeasons={seasons} />
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

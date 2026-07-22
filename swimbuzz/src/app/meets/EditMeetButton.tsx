"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import MeetFields, { type MeetFormState } from "./MeetFields"
import Modal, { ModalFooter } from "@/components/Modal"

export default function EditMeetButton({
  meetId,
  initial,
}: {
  meetId: string
  initial: MeetFormState
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
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
              className="flex-1 rounded-lg border border-border border-border-secondary px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border border-border-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.name.trim() || !form.startDate}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </ModalFooter>
        }
      >
        <MeetFields form={form} setForm={setForm} />
        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

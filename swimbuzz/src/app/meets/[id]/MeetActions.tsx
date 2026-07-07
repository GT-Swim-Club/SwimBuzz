"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import MeetFields, { type MeetFormState } from "../MeetFields"
import Modal, { ModalFooter } from "@/components/Modal"

export default function MeetActions({
  meetId,
  initial,
  meetName,
}: {
  meetId: string
  initial: MeetFormState
  meetName: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Failed to delete meet")
        setLoading(false)
        return
      }
      router.push("/meets")
      router.refresh()
    } catch {
      setError("Something went wrong")
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setForm(initial)
            setError(null)
            setEditing(true)
          }}
          className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirmDelete(true)
          }}
          className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors"
        >
          Delete
        </button>
      </div>

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
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </ModalFooter>
        }
      >
        <MeetFields form={form} setForm={setForm} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={loading}
        title="Delete meet"
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={loading}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Deleting…" : "Delete"}
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          Delete <span className="font-medium">{meetName}</span>? Imported swims are kept but
          will no longer be linked to this meet.
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Modal>
    </>
  )
}

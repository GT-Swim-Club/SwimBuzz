"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import PracticeEditor, { type PracticeFormState } from "../PracticeEditor"
import Modal, { ModalFooter } from "@/components/Modal"

export default function PracticeActions({
  practiceId,
  initial,
  title,
  published,
}: {
  practiceId: string
  initial: PracticeFormState
  title: string
  published: boolean
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function togglePublished(next: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/practices/${practiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...initial, published: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Failed to update practice")
        setLoading(false)
        return
      }
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
      const res = await fetch(`/api/practices/${practiceId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Failed to delete practice")
        setLoading(false)
        return
      }
      router.push("/practices")
      router.refresh()
    } catch {
      setError("Something went wrong")
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {published ? (
          <button
            type="button"
            onClick={() => togglePublished(false)}
            disabled={loading}
            className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors disabled:opacity-40"
          >
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            onClick={() => togglePublished(true)}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            Publish
          </button>
        )}
        <PracticeEditor
          practiceId={practiceId}
          initial={initial}
          triggerLabel="Edit"
          triggerClassName="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
        />
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

      {error && !confirmDelete && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={loading}
        title="Delete practice"
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
          Permanently delete <span className="font-medium">{title}</span> and all of its sets and
          comments? This cannot be undone.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </Modal>
    </>
  )
}

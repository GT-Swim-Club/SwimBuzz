"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"

type AthleteActionsProps = {
  athleteId: string
  firstName: string
  lastName: string
  email: string
  swimCloudId: number | null
}

export default function AthleteActions({
  athleteId,
  firstName,
  lastName,
  email,
  swimCloudId,
}: AthleteActionsProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName,
    lastName,
    email,
    swimCloudId: swimCloudId?.toString() ?? "",
  })

  function openEdit() {
    setForm({
      firstName,
      lastName,
      email,
      swimCloudId: swimCloudId?.toString() ?? "",
    })
    setError(null)
    setEditing(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          swimCloudId: form.swimCloudId === "" ? null : form.swimCloudId,
        }),
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
      const res = await fetch(`/api/athletes/${athleteId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Failed to delete athlete")
        setLoading(false)
        return
      }
      router.push("/athletes")
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
          onClick={openEdit}
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
        title="Edit athlete"
        maxWidth="md"
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
              First name
            </label>
            <input
              required
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
              Last name
            </label>
            <input
              required
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
            Email
          </label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
            SwimCloud ID
          </label>
          <input
            type="number"
            min={1}
            placeholder="optional"
            value={form.swimCloudId}
            onChange={(e) => setForm((f) => ({ ...f, swimCloudId: e.target.value }))}
            className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={loading}
        title="Delete athlete"
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
          Permanently delete <span className="font-medium">{firstName} {lastName}</span> and all
          of their swim records? This cannot be undone.
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Modal>
    </>
  )
}

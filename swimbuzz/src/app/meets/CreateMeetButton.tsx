"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import MeetFields, { emptyMeetForm, type MeetFormState } from "./MeetFields"

export default function CreateMeetButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<MeetFormState>(emptyMeetForm)

  function openModal() {
    setForm(emptyMeetForm)
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/meets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to create meet")
        return
      }
      setOpen(false)
      router.push(`/meets/${data.id}`)
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
        onClick={openModal}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New meet
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
            aria-label="Close dialog"
          />
          <div
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">
              Create meet
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <MeetFields form={form} setForm={setForm} />

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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
                  {loading ? "Creating…" : "Create meet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

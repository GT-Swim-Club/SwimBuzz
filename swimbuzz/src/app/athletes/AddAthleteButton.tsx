"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

export default function AddAthleteButton() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const gender = searchParams.get("gender") === "F" ? "F" : "M"
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
  })

  function openModal() {
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, gender, seasons: [year] }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to add athlete")
        return
      }

      setForm({ firstName: "", lastName: "", email: "" })
      setOpen(false)
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
        className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
      >
        Add athlete
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
            className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">
              Add athlete
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
              Adds to the {gender === "F" ? "Women" : "Men"} {year} roster.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

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
                  {loading ? "Adding…" : "Add athlete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

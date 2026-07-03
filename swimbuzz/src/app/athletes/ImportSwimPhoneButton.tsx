"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

type ImportResult = {
  imported: number
  parsed: number
  matched: number
  unmatchedCount: number
  unmatched: { name: string; event: string; time: string }[]
  meetName?: string
  meetDate?: string
  captchaLimited?: boolean
}

export default function ImportSwimPhoneButton({
  meetId,
  seasonYear,
}: {
  meetId?: string
  seasonYear?: string
} = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const year = seasonYear ?? searchParams.get("year") ?? String(new Date().getFullYear())

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [url, setUrl] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const trimmed = url.trim()
    if (!trimmed) {
      setError("Paste a SwimPhone meet URL")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/meets/import/swimphone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, year, meetId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Import failed")
        return
      }

      setResult(data)
      router.refresh()
    } catch {
      setError("Import failed — check that the dev server and scraper are running")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setError(null)
          setResult(null)
        }}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        SwimPhone
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
            className="relative z-10 w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">
              Import from SwimPhone
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
              Paste a SwimPhone meet link. Results are matched to athletes on both the men&apos;s and women&apos;s {year} rosters.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                  Meet URL
                </label>
                <input
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.swimphone.com/meets/meet_menu.cfm?smid=..."
                  className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
                />
                <p className="mt-1.5 text-xs text-gray-400 dark:text-zinc-500">
                  Works best during or shortly after a meet. Archived meets may be blocked by SwimPhone.
                </p>
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              {result && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50">
                  <p className="text-gray-900 dark:text-zinc-100">
                    Imported <strong>{result.imported}</strong> new swims from{" "}
                    <strong>{result.meetName ?? "meet"}</strong>
                    {result.meetDate ? ` (${result.meetDate})` : ""}
                    {" "}— {result.parsed} parsed, {result.matched} matched.
                  </p>
                  {result.captchaLimited && (
                    <p className="mt-2 text-amber-700 dark:text-amber-400">
                      SwimPhone blocked some archived results; only partial data was imported.
                    </p>
                  )}
                  {result.unmatchedCount > 0 && (
                    <p className="mt-2 text-gray-600 dark:text-zinc-400">
                      {result.unmatchedCount} result(s) could not be matched to a roster athlete.
                      {result.unmatched.length > 0 && (
                        <span className="block mt-1 text-xs">
                          e.g. {result.unmatched[0].name} — {result.unmatched[0].event} {result.unmatched[0].time}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? "Scraping…" : "Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

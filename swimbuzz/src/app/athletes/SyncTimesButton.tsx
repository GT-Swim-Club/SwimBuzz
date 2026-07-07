"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import DontReloadNotice from "@/components/DontReloadNotice"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { formatRelativeTime, formatDateTime } from "@/lib/utils"
import { currentSeason, parseSeason } from "@/lib/season"

type RosterAthlete = {
  id: string
  firstName: string
  lastName: string
  gender: "M" | "F"
  swimCloudId: number | null
  timesSyncedAt: string | null
}

type SyncResult = {
  imported: number
  athletes: number
  athletesSynced: number
  syncedAthleteIds: string[]
  timesSyncedAt: string | null
  failed: string[]
}

type SyncProgress = {
  current: number
  total: number
  name: string
}

export default function SyncTimesButton() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const gender = searchParams.get("gender") === "F" ? "F" : "M"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)

  useDontReloadWhileBusy(loading)
  const [roster, setRoster] = useState<RosterAthlete[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const selectable = roster.filter((a) => a.swimCloudId !== null)
  const allSelected =
    selectable.length > 0 && selectable.every((a) => selected.has(a.id))

  useEffect(() => {
    if (!open) return

    setLoadingRoster(true)
    setError(null)
    setResult(null)
    setProgress(null)

    fetch(`/api/times/sync?season=${encodeURIComponent(season)}&gender=${gender}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Failed to load roster")
        const athletes = data.athletes as RosterAthlete[]
        setRoster(athletes)
        setSelected(
          new Set(athletes.filter((a) => a.swimCloudId !== null).map((a) => a.id))
        )
      })
      .catch((err) => setError(err.message ?? "Failed to load roster"))
      .finally(() => setLoadingRoster(false))
  }, [open, season, gender])

  function toggleAthlete(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectable.map((a) => a.id)))
    }
  }

  async function handleSync(e: React.FormEvent) {
    e.preventDefault()

    const toSync = roster.filter(
      (a) => selected.has(a.id) && a.swimCloudId !== null
    )

    if (toSync.length === 0) {
      setError("Select at least one athlete with a SwimCloud ID")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setProgress({ current: 0, total: toSync.length, name: "Starting…" })

    try {
      const res = await fetch("/api/times/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season,
          gender,
          athleteIds: toSync.map((a) => a.id),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Import failed")
        return
      }

      setResult(data)
      if (data.timesSyncedAt && Array.isArray(data.syncedAthleteIds)) {
        const syncedIds = new Set<string>(data.syncedAthleteIds)
        setRoster((prev) =>
          prev.map((a) =>
            syncedIds.has(a.id) ? { ...a, timesSyncedAt: data.timesSyncedAt } : a
          )
        )
      }
      router.refresh()
    } catch {
      setError("Import failed — check that the dev server and scraper are running")
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
      >
        <Image src="/swimcloud.webp" alt="" width={28} height={28} className="shrink-0" />
        Import Times
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
            className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 flex flex-col max-h-[min(32rem,80vh)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 pt-5 pb-3">
              <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">
                Import times from SwimCloud
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                Select athletes on the {gender === "F" ? "women's" : "men's"} {season} roster.
              </p>
            </div>

            <form onSubmit={handleSync} className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 overflow-y-auto px-5 min-h-0">
                {loadingRoster ? (
                  <p className="text-sm text-gray-500 dark:text-zinc-400 py-3">Loading roster…</p>
                ) : roster.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-zinc-400 py-3">
                    No athletes on this season&apos;s roster.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 pb-3">
                    <div className="flex items-center justify-between sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm py-1.5 z-10">
                      <span className="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                        Athletes · {selected.size} selected
                      </span>
                      {selectable.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleAll}
                          disabled={loading}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                        >
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                      )}
                    </div>

                    <ul className="space-y-1.5">
                      {roster.map((athlete) => {
                        const disabled = athlete.swimCloudId === null
                        const checked = selected.has(athlete.id)

                        return (
                          <li key={athlete.id}>
                            <label
                              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                                disabled
                                  ? "border-gray-100 bg-gray-50/50 opacity-60 cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-950/50"
                                  : checked
                                    ? "border-indigo-200 bg-indigo-50/80 cursor-pointer dark:border-indigo-900/60 dark:bg-indigo-950/30"
                                    : "border-gray-100 bg-white cursor-pointer hover:border-gray-200 hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled || loading}
                                onChange={() => !disabled && toggleAthlete(athlete.id)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-700 shrink-0 dark:bg-indigo-950 dark:text-indigo-300">
                                {athlete.firstName[0]}{athlete.lastName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
                                  {athlete.lastName}, {athlete.firstName}
                                </p>
                                {disabled ? (
                                  <p className="text-xs text-gray-400 dark:text-zinc-500">No SwimCloud ID</p>
                                ) : (
                                  <p
                                    className="text-xs text-gray-400 dark:text-zinc-500"
                                    title={athlete.timesSyncedAt ? formatDateTime(athlete.timesSyncedAt) : undefined}
                                  >
                                    ID {athlete.swimCloudId} ·{" "}
                                    {athlete.timesSyncedAt
                                      ? `imported ${formatRelativeTime(athlete.timesSyncedAt)}`
                                      : "never imported"}
                                  </p>
                                )}
                              </div>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {loading && progress ? (
                  <p className="py-2 text-sm text-gray-500 dark:text-zinc-400">
                    Importing {progress.current}/{progress.total}: {progress.name}
                    <span className="mt-1 block text-xs text-gray-400 dark:text-zinc-500">
                      Don&apos;t reload the page while import finishes.
                    </span>
                  </p>
                ) : loading ? (
                  <DontReloadNotice className="py-2" />
                ) : null}

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>
                )}

                {result && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50 my-2">
                    <p className="text-gray-900 dark:text-zinc-100">
                      Imported <strong>{result.imported}</strong> new swims from{" "}
                      {result.athletesSynced}/{result.athletes} athletes
                      {result.failed.length > 0 && (
                        <> · failed: {result.failed.join(", ")}</>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="shrink-0 flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-zinc-800">
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
                  disabled={loading || loadingRoster || selected.size === 0}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? "Importing…" : `Import (${selected.size})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

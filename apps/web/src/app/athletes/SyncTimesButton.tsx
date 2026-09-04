"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import DontReloadNotice from "@/components/ui/DontReloadNotice"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { formatRelativeTime, formatDateTime } from "@/lib/utils"
import { currentSeason, parseSeason } from "@/lib/season"
import { useScraperUi } from "@/components/scraper/ScraperUiProvider"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import { runScraperEnqueuePollFinalize } from "@/lib/scraper/scraper-job-client"

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
  failed: Array<string | number>
}

type SyncProgress = {
  current: number
  total: number
  name: string
}

export default function SyncTimesButton() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawGender = searchParams.get("gender")
  const gender = rawGender === "all" ? "all" : rawGender === "F" ? "F" : "M"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  const { requireScraper } = useScraperUi()
  const { startTask } = useImportTask()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  useDontReloadWhileBusy(loading)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const [roster, setRoster] = useState<RosterAthlete[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const selectable = roster.filter((a) => a.swimCloudId !== null)
  const allSelected =
    selectable.length > 0 && selectable.every((a) => selected.has(a.id))

  useEffect(() => {
    if (!open) return

    setLoadingRoster(true)
    setError(null)
    setProgress(null)

    fetch(`/api/times/sync?season=${encodeURIComponent(season)}&gender=${gender}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Failed to load roster")
        const athletes = data.athletes as RosterAthlete[]
        setRoster(athletes)
        setSelected(new Set())
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

    const promise = (async () => {
      const data = await runScraperEnqueuePollFinalize<SyncResult>({
        enqueue: () =>
          fetch("/api/times/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              season,
              gender,
              athleteIds: toSync.map((a) => a.id),
            }),
          }),
        finalize: (jobId) =>
          fetch("/api/times/sync/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId }),
          }),
      })

      if (data.timesSyncedAt && Array.isArray(data.syncedAthleteIds)) {
        const syncedAt = String(data.timesSyncedAt)
        const syncedIds = new Set<string>(data.syncedAthleteIds.map(String))
        setRoster((prev) =>
          prev.map((a) =>
            syncedIds.has(a.id) ? { ...a, timesSyncedAt: syncedAt } : a
          )
        )
      }
      router.refresh()

      const result = data as SyncResult
      return `Imported ${result.imported} new swim${result.imported === 1 ? "" : "s"} from ${result.athletesSynced}/${result.athletes} athlete${result.athletes === 1 ? "" : "s"}.`
    })()

    startTask("Importing times…", promise)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => requireScraper(() => setOpen(true))}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border-secondary rounded-lg hover:border-border hover:bg-fill-tertiary bg-background dark:hover:bg-fill-tertiary dark:bg-background transition-colors"
      >
        <Image src="/swimcloud.webp" alt="" width={28} height={28} className="shrink-0" style={{ width: "auto" }} />
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
            className="relative z-10 w-full max-w-xl rounded-2xl border border-border bg-background shadow-xl flex flex-col max-h-[min(40rem,85vh)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-6 pt-6 pb-2">
              <h2 className="text-lg font-medium text-foreground">
                Import times from SwimCloud
              </h2>
              <p className="mt-1 text-sm text-foreground-secondary">
                Select from the {gender === "all" ? "" : gender === "F" ? "women's" : "men's"} {season} roster.
                Takes about 2–3 minutes per athlete.
              </p>
            </div>

            <form onSubmit={handleSync} className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 overflow-y-auto px-6 min-h-0">
                {loadingRoster ? (
                  <p className="text-sm text-foreground-secondary dark:text-foreground-secondary py-3">Loading roster…</p>
                ) : roster.length === 0 ? (
                  <p className="text-sm text-foreground-secondary dark:text-foreground-secondary py-3">
                    No athletes on this season&apos;s roster.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 pb-3">
                    <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-1.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground-secondary dark:text-foreground-secondary uppercase tracking-wide">
                          Athletes · {selected.size} selected
                        </span>
                        {selectable.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleAll}
                            disabled={loading}
                            className="text-xs font-medium text-primary hover:text-primary-hover dark:text-primary"
                          >
                            {allSelected ? "Deselect all" : "Select all"}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Search athletes…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>

                    <ul className="space-y-1.5">
                      {roster
                        .filter((a) =>
                          `${a.firstName} ${a.lastName}`
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase())
                        )
                        .map((athlete) => {
                          const disabled = athlete.swimCloudId === null
                          const checked = selected.has(athlete.id)

                        return (
                          <li key={athlete.id}>
                            <label
                                  className={`flex items-center gap-3 rounded-xl border border-border-secondary px-3 py-2.5 transition-colors ${
                                disabled
                                  ? "border-border-secondary bg-fill-secondary opacity-60 cursor-not-allowed"
                                  : checked
                                    ? "border-primary/50 bg-primary/10 cursor-pointer"
                                    : "border-border-secondary bg-background cursor-pointer hover:bg-fill-secondary"
                              }`}
                            >
                              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled || loading}
                                  onChange={() => !disabled && toggleAthlete(athlete.id)}
                                  className="peer sr-only"
                                />
                                <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-border-secondary bg-background transition-colors peer-checked:border-[var(--brand-color-primary)] peer-checked:bg-[var(--brand-color-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-disabled:opacity-50">
                                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 text-[var(--brand-primary-palette-1)]">
                                    <path d="m3.25 8.25 3 3 6.5-6.5" />
                                  </svg>
                                </span>
                              </span>
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary shrink-0 dark:bg-primary/20 dark:text-primary">
                                {athlete.firstName[0]}{athlete.lastName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground dark:text-foreground truncate">
                                  {athlete.lastName}, {athlete.firstName}
                                </p>
                                {disabled ? (
                                  <p className="text-xs text-foreground-tertiary dark:text-foreground-tertiary">No SwimCloud ID</p>
                                ) : (
                                  <p
                                    className="text-xs text-foreground-secondary dark:text-foreground-secondary"
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

                {error && (
                  <p className="text-sm text-error dark:text-error py-2">{error}</p>
                )}
              </div>

              <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={loading || loadingRoster || selected.size === 0}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
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

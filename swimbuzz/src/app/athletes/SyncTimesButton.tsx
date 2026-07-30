"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import DontReloadNotice from "@/components/DontReloadNotice"
import Modal, { ModalFooter } from "@/components/Modal"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { formatRelativeTime, formatDateTime } from "@/lib/utils"
import { currentSeason, parseSeason } from "@/lib/season"
import { useScraperUi } from "@/components/ScraperUiProvider"

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
  const gender = searchParams.get("gender") === "F" ? "F" : "M"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  const { requireScraper } = useScraperUi()

  const [open, setOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)

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

  function closeResultModal() {
    setResultOpen(false)
    setResult(null)
    setResultError(null)
  }

  function formatFailedLabels(failed: Array<string | number>): string[] {
    return failed.map((id) => {
      const num = typeof id === "number" ? id : parseInt(String(id), 10)
      const athlete = roster.find((a) => a.swimCloudId === num)
      if (athlete) return `${athlete.lastName}, ${athlete.firstName}`
      return String(id)
    })
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
    setResultError(null)
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
        setOpen(false)
        setResultError(data.error ?? "Import failed")
        setResultOpen(true)
        return
      }

      const nextResult = data as SyncResult
      setResult(nextResult)
      if (data.timesSyncedAt && Array.isArray(data.syncedAthleteIds)) {
        const syncedIds = new Set<string>(data.syncedAthleteIds)
        setRoster((prev) =>
          prev.map((a) =>
            syncedIds.has(a.id) ? { ...a, timesSyncedAt: data.timesSyncedAt } : a
          )
        )
      }
      setOpen(false)
      setResultOpen(true)
      router.refresh()
    } catch {
      setOpen(false)
      setResultError("Import failed — check that the scraper is running")
      setResultOpen(true)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const failedLabels = result?.failed?.length ? formatFailedLabels(result.failed) : []

  return (
    <>
      <button
        type="button"
        onClick={() => requireScraper(() => setOpen(true))}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border-secondary rounded-lg hover:border-border hover:bg-fill-tertiary bg-fill-secondary dark:hover:bg-fill-tertiary dark:bg-background transition-colors"
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
            className="relative z-10 w-full max-w-xl rounded-2xl border border-border-secondary bg-background shadow-xl dark:border border-border-secondary dark:bg-background-elevated flex flex-col max-h-[min(40rem,85vh)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 pt-5 pb-3">
              <h2 className="text-lg font-medium text-foreground dark:text-foreground">
                Import times from SwimCloud
              </h2>
              <p className="mt-1 text-sm text-foreground-secondary dark:text-foreground-secondary">
                Select from the {gender === "F" ? "women's" : "men's"} {season} roster.
                Takes about 2–3 minutes per athlete.
              </p>
            </div>

            <form onSubmit={handleSync} className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 overflow-y-auto px-5 min-h-0">
                {loadingRoster ? (
                  <p className="text-sm text-foreground-secondary dark:text-foreground-secondary py-3">Loading roster…</p>
                ) : roster.length === 0 ? (
                  <p className="text-sm text-foreground-secondary dark:text-foreground-secondary py-3">
                    No athletes on this season&apos;s roster.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 pb-3">
                    <div className="flex items-center justify-between sticky top-0 bg-background/95 bg-background/95 backdrop-blur-sm py-1.5 z-10">
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

                    <ul className="space-y-1.5">
                      {roster.map((athlete) => {
                        const disabled = athlete.swimCloudId === null
                        const checked = selected.has(athlete.id)

                        return (
                          <li key={athlete.id}>
                            <label
                                  className={`flex items-center gap-3 rounded-xl border border-border-secondary px-3 py-2.5 transition-colors ${
                                disabled
                                  ? "border-border-secondary bg-fill-secondary opacity-60 cursor-not-allowed"
                                  : checked
                                    ? "border-primary bg-primary/10 cursor-pointer"
                                    : "border-border-secondary bg-background cursor-pointer hover:bg-fill-secondary"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled || loading}
                                onChange={() => !disabled && toggleAthlete(athlete.id)}
                                className="rounded border-border-secondary text-primary focus:ring-primary"
                              />
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

                {loading && progress ? (
                  <p className="py-2 text-sm text-foreground-secondary text-foreground-secondary">
                    Importing {progress.current}/{progress.total}: {progress.name}
                    <span className="mt-1 block text-xs text-gray-400 dark:text-zinc-500">
                      About 1–2 minutes per athlete — don&apos;t reload the page while import
                      finishes.
                    </span>
                  </p>
                ) : loading ? (
                  <DontReloadNotice className="py-2" />
                ) : null}

                {error && (
                  <p className="text-sm text-error dark:text-error py-2">{error}</p>
                )}
              </div>

              <div className="shrink-0 flex gap-3 px-5 py-4 border-t border-border-secondary dark:border border-border-secondary">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border border-border-secondary"
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

      <Modal
        open={resultOpen}
        onClose={closeResultModal}
        title={resultError ? "Import failed" : "Import complete"}
        description={
          resultError
            ? resultError
            : result
              ? [
                  `Imported ${result.imported} new swim${result.imported === 1 ? "" : "s"} from ${result.athletesSynced}/${result.athletes} athlete${result.athletes === 1 ? "" : "s"}.`,
                  failedLabels.length
                    ? `Failed: ${failedLabels.join(", ")}.`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")
              : "Import finished."
        }
        maxWidth="sm"
        overlayClassName="z-[60]"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeResultModal}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover"
            >
              Done
            </button>
          </ModalFooter>
        }
      />
    </>
  )
}

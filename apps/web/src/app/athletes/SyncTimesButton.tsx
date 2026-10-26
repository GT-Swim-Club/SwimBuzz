"use client"

import { useEffect, useState, type KeyboardEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { formatDateTime } from "@/lib/utils"
import { currentSeason, parseSeason } from "@/lib/season"
import { formatSeasonLabel } from "@swimbuzz/shared"
import { normalizeSwimCloudIdInput, parseSwimCloudProfile } from "@/lib/swim/swimcloud-id"
import { useScraperUi } from "@/components/scraper/ScraperUiProvider"
import { useImportTask, type ImportTaskProgress } from "@/components/ui/ImportTaskProvider"
import {
  CLOUDFLARE_ALERT,
  runScraperEnqueuePollFinalize,
  scraperJobFraction,
  scraperRateLimitNotice,
  type ScraperJobStatusPayload,
} from "@/lib/scraper/scraper-job-client"
import { useEscapeToClose } from "@/lib/use-escape-to-close"
import { toolbarButtonClass } from "@/components/ui/FluidToolbar"
import HoverDetail from "@/components/ui/HoverDetail"
import { Skeleton } from "@/components/ui/Skeleton"
import ImportIcon from "./ImportIcon"

type RosterAthlete = {
  id: string
  firstName: string
  lastName: string
  gender: "M" | "F"
  /** Main profile first. */
  swimCloudIds: number[]
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

/** "Last imported" filter: any, never, or at least N days ago (never-imported athletes pass too). */
const IMPORT_FILTERS = [
  { value: "any", label: "Any import time" },
  { value: "14", label: "2+ weeks ago" },
  { value: "30", label: "1+ month ago" },
  { value: "60", label: "2+ months ago" },
  { value: "90", label: "3+ months ago" },
  { value: "180", label: "6+ months ago" },
  { value: "365", label: "1+ year ago" },
  { value: "never", label: "Never" },
] as const

type ImportFilter = (typeof IMPORT_FILTERS)[number]["value"]

const DAY_MS = 24 * 60 * 60 * 1000

const ICON_BUTTON =
  "inline-flex shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors duration-200 hover:bg-fill-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/34"
const LINK_BUTTON =
  "text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-hover"
const SECTION_HEADER =
  "sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-border-secondary bg-fill-secondary px-4 py-2 text-xs font-medium tabular-nums text-foreground-secondary"

/** Toast progress for a times-import scraper job, e.g. "2/5 athletes · Jane Doe". */
function timesImportProgress(
  job: ScraperJobStatusPayload,
  athletes: RosterAthlete[]
): ImportTaskProgress {
  if (job.status === "PENDING") return { detail: "Waiting for the scraper to start…" }
  if (job.status === "COMPLETED") return { detail: "Saving times…", progress: 1 }
  const progress = job.progress
  const total = progress?.total ?? athletes.length
  const athlete = athletes.find(
    (a) => progress?.swimmerId != null && a.swimCloudIds.includes(progress.swimmerId)
  )
  const count = `${progress?.current ?? 0}/${total} athlete${total === 1 ? "" : "s"}`
  return {
    detail: athlete ? `${count} · ${athlete.firstName} ${athlete.lastName}` : count,
    alert: progress?.cloudflare ? CLOUDFLARE_ALERT : undefined,
    quiet: progress?.browserFocused,
    notice: scraperRateLimitNotice(progress),
    progress: scraperJobFraction(progress),
  }
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS))
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`
}

/** "Imported 3 days ago", "Imported 2 weeks ago", "Never imported". */
function importStatus(timesSyncedAt: string | null): string {
  if (!timesSyncedAt) return "Never imported"
  const days = daysSince(timesSyncedAt)
  if (days === 0) return "Imported today"
  if (days === 1) return "Imported yesterday"
  if (days < 7) return `Imported ${plural(days, "day")}`
  if (days < 30) return `Imported ${plural(Math.floor(days / 7), "week")}`
  if (days < 365) return `Imported ${plural(Math.floor(days / 30), "month")}`
  return `Imported ${plural(Math.floor(days / 365), "year")}`
}

function passesImportFilter(athlete: RosterAthlete, filter: ImportFilter): boolean {
  if (filter === "any") return true
  if (!athlete.timesSyncedAt) return true
  if (filter === "never") return false
  return daysSince(athlete.timesSyncedAt) >= Number(filter)
}

function fullName(athlete: RosterAthlete): string {
  return `${athlete.firstName} ${athlete.lastName}`
}

function initials(athlete: RosterAthlete): string {
  return `${athlete.firstName[0] ?? ""}${athlete.lastName[0] ?? ""}`
}

function CheckIcon({ className, strokeWidth }: { className: string; strokeWidth: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/**
 * Inline editor for the athlete's main SwimCloud ID; accepts a bare ID or a
 * swimcloud.com/swimmer/… profile URL. Other profiles are edited on the athlete page.
 */
function SwimCloudIdEditor({
  athlete,
  onSave,
  onCancel,
}: {
  athlete: RosterAthlete
  onSave: (swimCloudId: number) => Promise<void>
  onCancel: () => void
}) {
  const main = athlete.swimCloudIds[0] ?? null
  const [draft, setDraft] = useState(main != null ? String(main) : "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = parseSwimCloudProfile(draft)
  const invalid = (draft.trim() !== "" && parsed === null) || error !== null

  async function save() {
    if (parsed === null || saving) return
    if (parsed === main) {
      onCancel()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save SwimCloud ID")
      setSaving(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      void save()
    } else if (e.key === "Escape") {
      // preventDefault keeps useEscapeToClose from also closing the modal.
      e.preventDefault()
      onCancel()
    }
  }

  return (
    // Swallow clicks so the surrounding row label doesn't toggle its checkbox.
    <div className="flex shrink-0 flex-col items-end gap-1" onClick={(e) => e.preventDefault()}>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          placeholder="ID or profile URL"
          aria-label={`SwimCloud ID or URL for ${fullName(athlete)}`}
          aria-invalid={invalid}
          value={draft}
          onChange={(e) => {
            setDraft(normalizeSwimCloudIdInput(e.target.value))
            setError(null)
          }}
          onKeyDown={onKeyDown}
          disabled={saving}
          autoFocus
          className={`h-[30px] w-[150px] rounded-md border bg-background px-2.5 text-[13px] tabular-nums text-foreground outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-foreground-tertiary disabled:opacity-60 ${
            // Important: the global gold :focus style is unlayered and would otherwise win.
            invalid
              ? "border-error! shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand-color-error)_10%,transparent)]!"
              : "border-border"
          }`}
        />
        <button
          type="button"
          aria-label="Save"
          disabled={parsed === null || saving}
          onClick={() => void save()}
          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md bg-primary text-primary-contrast transition-[background-color,opacity] duration-200 hover:enabled:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
          <HoverDetail label="Save" />
        </button>
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          disabled={saving}
          className={`${ICON_BUTTON} h-6 w-6`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          <HoverDetail label="Cancel" />
        </button>
      </div>
      {error && (
        <p role="alert" className="max-w-[220px] text-right text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}

function RosterListSkeleton() {
  const widths = ["w-32", "w-40", "w-28", "w-36", "w-44", "w-32", "w-24"]
  return (
    <div aria-hidden="true">
      <div className="flex items-center justify-between border-b border-border-secondary bg-fill-secondary px-4 py-2.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-14" />
      </div>
      <ul className="divide-y divide-border-secondary">
        {widths.map((width, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-[18px] w-[18px] shrink-0 rounded-[5px]" />
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className={`h-4 ${width}`} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SyncTimesButton() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawGender = searchParams.get("gender")
  const gender = rawGender === "F" ? "F" : rawGender === "M" ? "M" : "all"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  const { requireScraper } = useScraperUi()
  const { startTask } = useImportTask()

  const [open, setOpen] = useState(false)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [importFilter, setImportFilter] = useState<ImportFilter>("any")
  const [editingId, setEditingId] = useState<string | null>(null)

  useEscapeToClose(open, () => setOpen(false))

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

  useEffect(() => {
    if (!open) return

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

  function openModal() {
    setLoadingRoster(true)
    setError(null)
    setSearchQuery("")
    setImportFilter("any")
    setEditingId(null)
    setOpen(true)
  }

  const query = searchQuery.trim().toLowerCase()
  const matches = roster.filter((a) => fullName(a).toLowerCase().includes(query))
  const ready = matches.filter(
    (a) => a.swimCloudIds.length > 0 && passesImportFilter(a, importFilter)
  )
  const missing = matches.filter((a) => a.swimCloudIds.length === 0)
  const showMissing = importFilter === "any" && missing.length > 0
  const allSelected = ready.length > 0 && ready.every((a) => selected.has(a.id))
  const selectedCount = selected.size

  function toggleAthlete(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Only touches the athletes currently shown, so a search or filter narrows "Select all".
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const a of ready) {
        if (allSelected) next.delete(a.id)
        else next.add(a.id)
      }
      return next
    })
  }

  /** Replace the main ID, keeping the athlete's other profiles. */
  async function saveSwimCloudId(athlete: RosterAthlete, swimCloudId: number) {
    const others = athlete.swimCloudIds.slice(1).filter((id) => id !== swimCloudId)
    const res = await fetch(`/api/athletes/${athlete.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ swimCloudIds: [swimCloudId, ...others] }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? "Failed to save SwimCloud ID")
    setRoster((prev) =>
      prev.map((a) => (a.id === athlete.id ? { ...a, swimCloudIds: data.swimCloudIds } : a))
    )
    setEditingId(null)
    router.refresh()
  }

  function handleSync() {
    const toSync = roster.filter(
      (a) => selected.has(a.id) && a.swimCloudIds.length > 0
    )

    if (toSync.length === 0) {
      setError("Select at least one athlete with a SwimCloud ID")
      return
    }

    const run = async (report: (progress: ImportTaskProgress) => void) => {
      let data: SyncResult
      try {
        data = await runScraperEnqueuePollFinalize<SyncResult>({
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
          onJob: (job) => report(timesImportProgress(job, toSync)),
        })
      } catch (err) {
        // A scraper that died partway still saved the athletes it finished.
        router.refresh()
        throw err
      }

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
    }

    startTask("Importing SwimCloud times…", run, { lifetime: "scraper" })
    setOpen(false)
  }

  const rosterLabel = `${gender === "all" ? "" : gender === "F" ? "women's " : "men's "}${formatSeasonLabel(season)}`
  const emptyText =
    roster.length === 0
      ? "No athletes on this season’s roster."
      : importFilter === "any"
        ? "No athletes match your search."
        : "No athletes match these filters."

  function renderEditor(athlete: RosterAthlete) {
    return (
      <SwimCloudIdEditor
        athlete={athlete}
        onSave={(swimCloudId) => saveSwimCloudId(athlete, swimCloudId)}
        onCancel={() => setEditingId(null)}
      />
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => requireScraper(openModal, { continueLabel: "Continue to import" })}
        aria-label="Import times"
        className={toolbarButtonClass}
      >
        <ImportIcon />
        Times
        <HoverDetail label="Import times" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close dialog"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-times-title"
            className="relative z-10 flex h-[min(40rem,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-6 pt-6 pb-2">
              <h2 id="sync-times-title" className="text-lg leading-tight font-medium text-foreground">
                Import times from SwimCloud
              </h2>
              <p className="mt-1.5 text-sm text-foreground-secondary">
                Pick athletes from the {rosterLabel} roster. Each one takes about 3–4 minutes.
              </p>
            </div>

            <div className="flex shrink-0 gap-2 px-6 py-3">
              <label className="sr-only" htmlFor="sync-times-search">Search athletes</label>
              <input
                id="sync-times-search"
                type="search"
                placeholder="Search athletes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-foreground-tertiary"
              />
              <label className="sr-only" htmlFor="sync-times-filter">Last imported</label>
              {/* The chevron comes from the global select style in globals.css. */}
              <select
                id="sync-times-filter"
                value={importFilter}
                onChange={(e) => setImportFilter(e.target.value as ImportFilter)}
                className={`w-[164px] shrink-0 cursor-pointer rounded-lg border py-2 pl-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-100 ${
                  importFilter === "any" ? "border-border bg-background" : "border-primary/50 bg-primary/5"
                }`}
              >
                {IMPORT_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-6 pb-4">
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
                {loadingRoster ? (
                  <RosterListSkeleton />
                ) : ready.length === 0 && !showMissing ? (
                  <p className="px-4 py-6 text-center text-sm text-foreground-secondary">{emptyText}</p>
                ) : (
                  <>
                    {ready.length > 0 && (
                      <>
                        <div className={SECTION_HEADER}>
                          <span>Ready to import · {ready.length}</span>
                          <button type="button" onClick={toggleAll} className={`ml-auto ${LINK_BUTTON}`}>
                            {allSelected ? "Deselect all" : "Select all"}
                          </button>
                        </div>
                        <ul className="divide-y divide-border-secondary">
                          {ready.map((athlete) => {
                            const checked = selected.has(athlete.id)
                            const name = fullName(athlete)
                            return (
                              <li key={athlete.id}>
                                <label
                                  className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 ${
                                    checked ? "bg-primary/5" : "hover:bg-background-hover"
                                  }`}
                                >
                                  <span className="relative flex h-[18px] w-[18px] shrink-0">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleAthlete(athlete.id)}
                                      className="peer sr-only"
                                    />
                                    <span
                                      aria-hidden="true"
                                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors duration-200 peer-focus-visible:border-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-primary/34 ${
                                        checked
                                          ? "border-primary bg-primary text-primary-contrast"
                                          : "border-border bg-background text-transparent group-hover:border-primary"
                                      }`}
                                    >
                                      <CheckIcon className="h-3 w-3" strokeWidth={3} />
                                    </span>
                                  </span>
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/18 text-xs font-semibold text-primary">
                                    {initials(athlete)}
                                  </div>
                                  <p className="min-w-0 flex-1 truncate text-base leading-[22px] font-medium text-foreground">
                                    {name}
                                  </p>
                                  {editingId === athlete.id ? (
                                    renderEditor(athlete)
                                  ) : (
                                    <div className="flex shrink-0 flex-col items-end text-right">
                                      <span
                                        className="text-[13px] leading-[18px] text-foreground-secondary"
                                        title={athlete.timesSyncedAt ? formatDateTime(athlete.timesSyncedAt) : undefined}
                                      >
                                        {importStatus(athlete.timesSyncedAt)}
                                      </span>
                                      <div className="-mr-1 mt-0.5 flex items-center gap-0.5">
                                        {athlete.swimCloudIds.map((id, index) => (
                                          <a
                                            key={id}
                                            href={`https://www.swimcloud.com/swimmer/${id}/`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={`Open ${name}${index ? `'s profile ${index + 1}` : ""} on SwimCloud (new tab)`}
                                            className="text-xs leading-4 tabular-nums text-foreground-tertiary underline-offset-2 transition-colors duration-200 hover:text-primary hover:underline"
                                          >
                                            {index ? `· ${id}` : `SwimCloud ID ${id}`}
                                          </a>
                                        ))}
                                        <button
                                          type="button"
                                          aria-label={`Edit SwimCloud ID for ${name}`}
                                          onClick={() => setEditingId(athlete.id)}
                                          className={`${ICON_BUTTON} h-5 w-5`}
                                        >
                                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                                            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                                            <path d="m15 5 4 4" />
                                          </svg>
                                          <HoverDetail label="Edit SwimCloud ID" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      </>
                    )}

                    {showMissing && (
                      <>
                        <div className={`${SECTION_HEADER} ${ready.length > 0 ? "border-t" : ""}`}>
                          <span>No SwimCloud ID · {missing.length}</span>
                        </div>
                        <ul className="divide-y divide-border-secondary">
                          {missing.map((athlete) => {
                            const name = fullName(athlete)
                            return (
                              <li key={athlete.id} className="flex items-center gap-3 px-4 py-2.5">
                                <span aria-hidden="true" className="w-[18px] shrink-0" />
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-xs font-semibold text-foreground-secondary opacity-50">
                                  {initials(athlete)}
                                </div>
                                <p className="min-w-0 flex-1 truncate text-base leading-[22px] font-medium text-foreground opacity-50">
                                  {name}
                                </p>
                                {editingId === athlete.id ? (
                                  renderEditor(athlete)
                                ) : (
                                  <button
                                    type="button"
                                    aria-label={`Add SwimCloud ID for ${name}`}
                                    onClick={() => setEditingId(athlete.id)}
                                    className={`shrink-0 ${LINK_BUTTON}`}
                                  >
                                    Add SwimCloud ID
                                  </button>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
              {error && <p role="alert" className="pt-2 text-sm text-error">{error}</p>}
            </div>

            <div className="flex shrink-0 gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 flex-1 rounded-lg border border-border bg-background px-6 text-[15px] leading-none font-semibold text-foreground transition-[background-color,opacity] duration-200 hover:bg-fill-secondary active:opacity-90"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={loadingRoster || selectedCount === 0}
                className="min-h-11 flex-1 rounded-lg border border-transparent bg-primary px-6 text-[15px] leading-none font-semibold tabular-nums text-primary-contrast shadow-xs transition-[background-color,opacity] duration-200 hover:enabled:bg-primary-hover active:enabled:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {selectedCount === 0
                  ? "Import"
                  : `Import ${selectedCount} athlete${selectedCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { currentSeason, parseSeason, seasonEndYear } from "@/lib/season"
import Modal, { ModalFooter } from "@/components/Modal"
import { useScraperUi } from "@/components/ScraperUiProvider"
import { useImportTask } from "@/components/ImportTaskProvider"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/FileDropzone"
import { SegmentedToggle, segmentedOptionClass } from "@/components/SegmentedToggle"
import { runScraperEnqueuePollFinalize } from "@/lib/scraper-job-client"
import { pickSpreadsheet, type PickedSpreadsheet } from "@/lib/google-picker-client"

type ImportSource = "swimcloud" | "csv" | "sheets"

type SheetTab = { gid: number; title: string }

export default function ImportRosterButton() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const gender = searchParams.get("gender") ?? "all"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()
  const genderLabel = gender === "F" ? "Women's" : gender === "M" ? "Men's" : ""
  const rosterLabel = `${genderLabel} ${season}`

  const { connected: scraperConnected, requireScraper } = useScraperUi()
  const { startTask } = useImportTask()

  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>("csv")
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picked, setPicked] = useState<PickedSpreadsheet | null>(null)
  const [tabs, setTabs] = useState<SheetTab[] | null>(null)
  const [selectedGid, setSelectedGid] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)

  const modalDescription =
    source === "csv"
      ? `Adds athletes to the ${season} roster.`
      : source === "sheets"
        ? `Adds athletes to the ${season} roster from a Google Sheet.`
        : `Imports SwimCloud IDs to the ${rosterLabel} roster.`

  function resetForm() {
    setSource("csv")
    setError(null)
    setSelectedFile(null)
    setPicked(null)
    setTabs(null)
    setSelectedGid(null)
  }

  async function handleChooseSheet() {
    setPicking(true)
    setError(null)
    try {
      const result = await pickSpreadsheet()
      if (!result) return // user cancelled the picker

      setPicked(result)
      setTabs(null)
      setSelectedGid(null)

      const res = await fetch("/api/roster/import/sheet/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: result.accessToken, spreadsheetId: result.spreadsheetId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that sheet")

      const sheetTabs: SheetTab[] = data.tabs ?? []
      setTabs(sheetTabs)
      setSelectedGid(sheetTabs[0]?.gid ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open Google Drive picker")
    } finally {
      setPicking(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (source === "swimcloud") {
      requireScraper(() => {
        void (async () => {
          setOpen(false)

          const season_ = season
          const gender_ = gender

          startTask(
            "Importing roster (SwimCloud)…",
            (async () => {
              const data = await runScraperEnqueuePollFinalize<{
                linked?: number
                updated?: number
                unmatched?: number
                skippedConflict?: number
              }>({
                enqueue: () =>
                  fetch("/api/roster/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      season: season_,
                      year: seasonEndYear(season_),
                      gender: gender_,
                    }),
                  }),
                finalize: (jobId) =>
                  fetch("/api/roster/sync/finalize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId }),
                  }),
              })
              const linked = data.linked ?? data.updated ?? 0
              const parts: string[] = [`Imported SwimCloud IDs on ${linked} athlete${linked === 1 ? "" : "s"}`]
              if ((data.unmatched ?? 0) > 0)
                parts.push(`${data.unmatched} unmatched`)
              if ((data.skippedConflict ?? 0) > 0)
                parts.push(`${data.skippedConflict} skipped (conflict)`)
              router.refresh()
              return parts.join(" · ")
            })()
          )
        })()
      })
      return
    }

    if (source === "sheets") {
      if (!picked || selectedGid == null) {
        setError("Choose a Google Sheet first")
        return
      }
      const { accessToken, spreadsheetId } = picked
      const gid = selectedGid
      setOpen(false)

      startTask(
        "Importing roster (Google Sheets)…",
        (async () => {
          const res = await fetch("/api/roster/import/sheet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken, spreadsheetId, gid, season }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? "Import failed")

          const parts: string[] = [
            `Imported ${data.created} new athlete${data.created === 1 ? "" : "s"}`,
          ]
          if (data.updated > 0) parts.push(`updated ${data.updated}`)
          if (data.parsed > 0) parts.push(`${data.parsed} rows parsed`)
          if (data.errors?.length > 0)
            parts.push(`${data.errors.length} row(s) skipped`)
          router.refresh()
          return parts.join(" · ")
        })()
      )
      return
    }

    if (!selectedFile) {
      setError("Choose a CSV file first")
      return
    }

    const file = selectedFile
    setOpen(false)

    startTask(
      "Importing roster (CSV)…",
      (async () => {
        const body = new FormData()
        body.append("file", file, file.name)
        body.append("season", season)

        const res = await fetch("/api/roster/import", { method: "POST", body })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Import failed")

        const parts: string[] = [
          `Imported ${data.created} new athlete${data.created === 1 ? "" : "s"}`,
        ]
        if (data.updated > 0) parts.push(`updated ${data.updated}`)
        if (data.parsed > 0) parts.push(`${data.parsed} rows parsed`)
        if (data.errors?.length > 0)
          parts.push(`${data.errors.length} row(s) skipped`)
        router.refresh()
        return parts.join(" · ")
      })()
    )
  }

  const canSubmit =
    source === "swimcloud"
      ? true
      : source === "sheets"
        ? !!picked && selectedGid != null
        : !!selectedFile

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm()
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border-secondary rounded-lg hover:border-border hover:bg-fill-tertiary bg-background dark:hover:bg-fill-tertiary dark:bg-background transition-colors"
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
        Import Roster
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import Roster"
        description={modalDescription}
        header={
          <SegmentedToggle
            selectedIndex={source === "swimcloud" ? 1 : source === "sheets" ? 2 : 0}
            fullWidth
            className="mt-4 rounded-lg border border-border-secondary bg-background"
          >
            {(
              [
                ["csv", "CSV", "icon"] as const,
                ["swimcloud", "SwimCloud IDs", "logo"] as const,
                ["sheets", "Google Sheets", "sheet"] as const,
              ] as const
            ).map(([value, label, adornment]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSource(value)
                  setError(null)
                }}
                className={segmentedOptionClass(source === value) + " text-xs"}
              >
                {adornment === "logo" && (
                    <Image
                    src="/swimcloud.webp"
                    alt=""
                    width={20}
                    height={20}
                    className="shrink-0"
                    style={{ width: "auto" }}
                  />
                )}
                {adornment === "icon" && (
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
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                )}
                {adornment === "sheet" && (
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
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </svg>
                )}
                {label}
              </button>
            ))}
          </SegmentedToggle>
        }
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary hover:bg-fill-secondary border-border-secondary"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              Import
            </button>
          </ModalFooter>
        }
      >
        {source === "swimcloud" ? (
          <div className="space-y-2 text-md text-foreground-secondary text-foreground-secondary">
            <p>
              Imports SwimCloud IDs for athletes already on your roster. Does not add new athletes.
            </p>
          </div>
        ) : source === "sheets" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border-secondary bg-fill-secondary px-4 py-3 text-sm">
              <p className="font-medium text-foreground text-foreground">Required columns</p>
              <ul className="mt-2 space-y-1.5 text-foreground-secondary text-foreground-secondary">
                <li>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">Name</span>
                  {" — "}
                  <span className="text-foreground-secondary text-foreground-secondary">
                    First Name &amp; Last Name
                  </span>
                </li>
                <li>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">Gender</span>
                  {" — "}
                  <span className="text-foreground-secondary text-foreground-secondary">
                    M/F, Male/Female, Men/Women, or Boy/Girl
                  </span>
                </li>
              </ul>
              <p className="mt-3 font-medium text-foreground text-foreground">Recommended columns</p>
              <ul className="mt-2 space-y-1.5 text-foreground-secondary text-foreground-secondary text-xs">
                <li>Email, Nicknames, GTID, DOB, Year</li>
              </ul>
            </div>

            {!picked ? (
              <div className="rounded-lg border border-border-secondary px-4 py-3 text-sm space-y-2">
                <p className="text-foreground-secondary text-foreground-secondary">
                  Choose the roster spreadsheet from your Google Drive.
                </p>
                <button
                  type="button"
                  onClick={() => void handleChooseSheet()}
                  disabled={picking}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-secondary px-3 py-1.5 text-sm font-medium hover:bg-fill-tertiary disabled:opacity-50"
                >
                  {picking ? "Opening Google Drive…" : "Choose from Google Drive"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border-secondary px-4 py-2.5 text-sm">
                  <span className="text-foreground-secondary text-foreground-secondary">
                    Selected <span className="font-medium text-foreground text-foreground">{picked.fileName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleChooseSheet()}
                    disabled={picking}
                    className="text-xs font-medium text-foreground-secondary text-foreground-secondary hover:text-foreground hover:text-foreground disabled:opacity-50"
                  >
                    Change
                  </button>
                </div>
                {tabs === null ? (
                  <p className="text-sm text-foreground-secondary text-foreground-secondary">Reading sheet…</p>
                ) : tabs.length > 1 ? (
                  <div>
                    <span className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
                      Tab
                    </span>
                    <select
                      value={selectedGid ?? ""}
                      onChange={(e) => setSelectedGid(Number(e.target.value))}
                      className="w-full rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm outline-none focus:border-border"
                    >
                      {tabs.map((tab) => (
                        <option key={tab.gid} value={tab.gid}>
                          {tab.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border-secondary bg-fill-secondary px-4 py-3 text-sm">
              <p className="font-medium text-foreground text-foreground">Required columns</p>
              <ul className="mt-2 space-y-1.5 text-foreground-secondary text-foreground-secondary">
                <li>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">Name</span>
                  {" — "}
                  <span className="text-foreground-secondary text-foreground-secondary">
                    First Name &amp; Last Name
                  </span>
                </li>
                <li>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">Gender</span>
                  {" — "}
                  <span className="text-foreground-secondary text-foreground-secondary">
                    M/F, Male/Female, Men/Women, or Boy/Girl
                  </span>
                </li>
              </ul>
              <p className="mt-3 font-medium text-foreground text-foreground">Recommended columns</p>
              <ul className="mt-2 space-y-1.5 text-foreground-secondary text-foreground-secondary text-xs">
                <li>Email, Nicknames, GTID, DOB, Year</li>
              </ul>
            </div>

            <div>
              <span className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
                Roster CSV
              </span>
              <FileDropzone
                onFilesSelected={(files) => {
                  setSelectedFile(files[0] ?? null);
                  setError(null);
                }}
                accept=".csv,text/csv"
                className={fileDropzoneSurfaceClassName(Boolean(selectedFile))}
              >
                <FileDropzoneContent
                  fileName={selectedFile?.name}
                  emptyLabel="Click or drag and drop to upload a CSV file"
                  onRemove={() => setSelectedFile(null)}
                />
              </FileDropzone>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

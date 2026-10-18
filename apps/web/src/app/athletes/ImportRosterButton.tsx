"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { currentSeason, parseSeason } from "@/lib/season"
import { formatSeasonLabel } from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { toolbarButtonClass } from "@/components/ui/FluidToolbar"
import ImportIcon from "./ImportIcon"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/ui/FileDropzone"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import { pickSpreadsheet, type PickedSpreadsheet } from "@/lib/roster/google-picker-client"

type ImportSource = "csv" | "sheets"

type SheetTab = { gid: number; title: string }

function formatRosterReplaceResult(data: {
  created?: number
  updated?: number
  removed?: number
  errors?: unknown[]
}) {
  const created = data.created ?? 0
  const updated = data.updated ?? 0
  const removed = data.removed ?? 0
  const parts = [`Replaced the roster (${created + updated})`]
  if (created > 0) parts.push(`${created} new`)
  if (updated > 0) parts.push(`${updated} updated`)
  if (removed > 0) parts.push(`${removed} removed`)
  if ((data.errors?.length ?? 0) > 0) parts.push(`${data.errors!.length} row(s) skipped`)
  return parts.join(" · ")
}

export default function ImportRosterButton() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  const { startTask } = useImportTask()

  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>("sheets")
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picked, setPicked] = useState<PickedSpreadsheet | null>(null)
  const [tabs, setTabs] = useState<SheetTab[] | null>(null)
  const [selectedGid, setSelectedGid] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)

  const modalDescription =
    source === "csv"
      ? `Replaces the ${formatSeasonLabel(season)} roster with this file.`
      : `Replaces the ${formatSeasonLabel(season)} roster with this Google Sheet.`

  function resetForm() {
    setSource("sheets")
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

          router.refresh()
          return formatRosterReplaceResult(data)
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

        router.refresh()
        return formatRosterReplaceResult(data)
      })()
    )
  }

  const canSubmit = source === "sheets" ? !!picked && selectedGid != null : !!selectedFile

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm()
          setOpen(true)
        }}
        aria-label="Import roster"
        className={toolbarButtonClass}
      >
        <ImportIcon />
        Roster
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import Roster"
        maxWidth="xl"
        description={modalDescription}
        header={
          <SegmentedToggle
            selectedIndex={source === "csv" ? 1 : 0}
            fullWidth
            className="mt-4 rounded-lg border border-border-secondary bg-background"
          >
            {(
              [
                ["sheets", "Google Sheets", "sheet"] as const,
                ["csv", "CSV", "icon"] as const,
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
                  <Image src="/google-sheets.png" alt="" width={16} height={16} className="shrink-0" />
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
        {source === "sheets" ? (
          <div className="space-y-4">
            <RosterColumnsHint />

            {!picked ? (
              <button
                type="button"
                onClick={() => void handleChooseSheet()}
                disabled={picking}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background-hover disabled:opacity-50"
              >
                <Image src="/google-sheets.png" alt="" width={18} height={18} className="shrink-0" />
                {picking ? "Opening Google Drive…" : "Choose from Google Sheets"}
              </button>
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
                  <label className="flex items-center gap-3">
                    <span className="shrink-0 text-sm font-medium text-foreground-secondary">Tab</span>
                    <select
                      value={selectedGid ?? ""}
                      onChange={(e) => setSelectedGid(Number(e.target.value))}
                      className="min-w-0 flex-1 rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm outline-none focus:border-border"
                    >
                      {tabs.map((tab) => (
                        <option key={tab.gid} value={tab.gid}>
                          {tab.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <RosterColumnsHint />

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

/** Which columns the roster CSV / Google Sheet import reads (see lib/roster/roster-csv.ts). */
function RosterColumnsHint() {
  return (
    <div className="rounded-lg border border-border-secondary bg-fill-secondary px-4 py-3 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className="font-medium text-foreground">Required</dt>
        <dd className="text-foreground-secondary">Full Name (First &amp; Last Name), Gender, Email</dd>
        <dt className="font-medium text-foreground">Recommended</dt>
        <dd className="text-foreground-secondary">Preferred Name, GTID, DOB, Year, SwimCloud URL</dd>
      </dl>
    </div>
  )
}

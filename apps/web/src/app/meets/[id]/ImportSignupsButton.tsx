"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import { useAthletePairing, type NameConfirmation, type RosterPairingOption } from "@/components/meet/AthletePairingProvider"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/ui/FileDropzone"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import { pickSpreadsheet, type PickedSpreadsheet } from "@/lib/roster/google-picker-client"

type ImportSource = "csv" | "sheets"

type SheetTab = { gid: number; title: string }

type SignupImportResult = {
  imported: number
  entries: number
  attendingOnly: number
  skipped: number
  warnings: string[]
  nameConfirmations?: NameConfirmation[]
  rosterForPairing?: RosterPairingOption[]
}

type Pairing = { nameMappings?: Record<string, string>; rejectedNames?: string[] }

function formatSignupImportResult(data: SignupImportResult) {
  const parts = [`Imported ${data.imported} sign-up${data.imported === 1 ? "" : "s"}`]
  parts.push(`${data.entries} entr${data.entries === 1 ? "y" : "ies"}`)
  if (data.attendingOnly > 0) parts.push(`${data.attendingOnly} attending only`)
  if (data.skipped > 0) parts.push(`${data.skipped} skipped`)
  if (data.warnings.length > 0) parts.push(`${data.warnings.length} event${data.warnings.length === 1 ? "" : "s"} not imported`)
  return parts.join(" · ")
}

/** Coach dialog: import meet sign-up form responses (Google Sheet or CSV) into the roster summary. */
export default function ImportSignupsButton({
  meetId,
  trigger,
}: {
  meetId: string
  trigger: (open: () => void) => ReactNode
}) {
  const router = useRouter()
  const { startTask } = useImportTask()
  const { requestPairing } = useAthletePairing()

  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>("sheets")
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picked, setPicked] = useState<PickedSpreadsheet | null>(null)
  const [tabs, setTabs] = useState<SheetTab[] | null>(null)
  const [selectedGid, setSelectedGid] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)

  function openDialog() {
    setSource("sheets")
    setError(null)
    setSelectedFile(null)
    setPicked(null)
    setTabs(null)
    setSelectedGid(null)
    setOpen(true)
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

  /** Runs the import; re-run with the coach's pairings after the pairing dialog. */
  function buildRunner(): ((pairing: Pairing) => Promise<SignupImportResult>) | null {
    const url = `/api/meets/${meetId}/signup-import`
    if (source === "sheets") {
      if (!picked || selectedGid == null) return null
      const { accessToken, spreadsheetId } = picked
      const gid = selectedGid
      return async (pairing) => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, spreadsheetId, gid, ...pairing }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Import failed")
        return data as SignupImportResult
      }
    }

    const file = selectedFile
    if (!file) return null
    return async (pairing) => {
      const body = new FormData()
      body.append("file", file, file.name)
      if (pairing.nameMappings) body.append("nameMappings", JSON.stringify(pairing.nameMappings))
      if (pairing.rejectedNames?.length) body.append("rejectedNames", JSON.stringify(pairing.rejectedNames))
      const res = await fetch(url, { method: "POST", body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Import failed")
      return data as SignupImportResult
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const run = buildRunner()
    if (!run) {
      setError(source === "sheets" ? "Choose a Google Sheet first" : "Choose a CSV file first")
      return
    }
    setOpen(false)

    startTask(
      `Importing sign-ups (${source === "sheets" ? "Google Sheets" : "CSV"})…`,
      (async () => {
        const data = await run({})
        if (data.warnings.length > 0) console.info("[sign-up import]", data.warnings)
        const confirmations = data.nameConfirmations ?? []
        if (confirmations.length > 0) {
          requestPairing({
            confirmations,
            roster: data.rosterForPairing ?? [],
            description:
              "These sign-ups didn't match anyone on the roster. Pair them to a roster athlete to import their events.",
            occurrenceNoun: ["sign-up", "sign-ups"],
            submitVerb: "Import",
            taskLabel: "Importing paired sign-ups…",
            submit: async (nameMappings, rejectedNames) => {
              const paired = await run({ nameMappings, rejectedNames })
              router.refresh()
              return formatSignupImportResult(paired)
            },
            onSkip: () => router.refresh(),
          })
        }
        router.refresh()
        return formatSignupImportResult(data)
      })()
    )
  }

  const canSubmit = source === "sheets" ? !!picked && selectedGid != null : !!selectedFile

  return (
    <>
      {trigger(openDialog)}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import Sign-ups"
        maxWidth="xl"
        description="Adds each response's events and entry times to the roster summary, replacing the last sign-up import."
        header={
          <SegmentedToggle
            selectedIndex={source === "csv" ? 1 : 0}
            fullWidth
            className="mt-4 rounded-lg border border-border-secondary bg-background"
          >
            {(
              [
                ["sheets", "Google Sheets"],
                ["csv", "CSV"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSource(value)
                  setError(null)
                }}
                className={segmentedOptionClass(source === value) + " text-xs"}
              >
                {value === "sheets" ? (
                  <Image src="/google-sheets.png" alt="" width={16} height={16} className="shrink-0" />
                ) : (
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
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
            >
              Import
            </button>
          </ModalFooter>
        }
      >
        <div className="space-y-4">
          <SignupColumnsHint />

          {source === "sheets" ? (
            !picked ? (
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
                  <span className="text-foreground-secondary">
                    Selected <span className="font-medium text-foreground">{picked.fileName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleChooseSheet()}
                    disabled={picking}
                    className="text-xs font-medium text-foreground-secondary hover:text-foreground disabled:opacity-50"
                  >
                    Change
                  </button>
                </div>
                {tabs === null ? (
                  <p className="text-sm text-foreground-secondary">Reading sheet…</p>
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
            )
          ) : (
            <div>
              <span className="mb-1 block text-xs font-medium text-foreground-secondary">Sign-ups CSV</span>
              <FileDropzone
                onFilesSelected={(files) => {
                  setSelectedFile(files[0] ?? null)
                  setError(null)
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
          )}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

/** Which columns the sign-up import reads (see lib/meet/meet-signup-import.ts). */
function SignupColumnsHint() {
  return (
    <div className="rounded-lg border border-border-secondary bg-fill-secondary px-4 py-3 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className="font-medium text-foreground">Required</dt>
        <dd className="text-foreground-secondary">
          First &amp; Last Name or GT Email, Event Number 1, 2, …
        </dd>
        <dt className="font-medium text-foreground">Recommended</dt>
        <dd className="text-foreground-secondary">Event N Entry Time, Relay Preferences</dd>
      </dl>
    </div>
  )
}

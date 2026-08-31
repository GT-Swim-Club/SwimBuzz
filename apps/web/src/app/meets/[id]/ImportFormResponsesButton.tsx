"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { useImportTask } from "@/components/ImportTaskProvider"
import { pickSpreadsheet, type PickedSpreadsheet } from "@/lib/google-picker-client"
import type { ColumnMapping, ColumnTarget, ColumnTargetOption } from "@/lib/form-import-columns"
import type { NearMatchAthlete } from "@/lib/athlete-match"

type FormType = "signup" | "rooms"

type SheetTab = { gid: number; title: string }

type PreviewResponse = {
  tabs: SheetTab[]
  tab: string
  headers: string[]
  sampleRows: string[][]
  rowCount: number
  targets: ColumnTargetOption[]
  suggestedMapping: ColumnMapping
}

type DryRunRow = {
  rowNumber: number
  rawName: string
  rawEmail: string
  athleteId: string | null
  matchedBy: "override" | "email" | "name" | null
  suggestion: NearMatchAthlete | null
  preview: Record<string, unknown>
  warnings: string[]
}

type DryRunResponse = {
  rows: DryRunRow[]
  errors: Array<{ row: number; message: string }>
  roster: Array<{ id: string; name: string }>
}

const LABELS: Record<FormType, { title: string; verb: string; taskLabel: string; setUpError: string }> = {
  signup: {
    title: "Import Sign-Up Responses",
    verb: "sign-up",
    taskLabel: "Importing sign-up responses…",
    setUpError: "Set up the sign-up form before importing responses.",
  },
  rooms: {
    title: "Import Roommate Responses",
    verb: "roommate preference",
    taskLabel: "Importing roommate preferences…",
    setUpError: "Set up roommate preferences before importing responses.",
  },
}

function targetOptionValue(target: ColumnTarget): string {
  switch (target.kind) {
    case "eventTime":
      return `eventTime:${target.event}`
    case "question":
      return `question:${target.questionId}`
    default:
      return target.kind
  }
}

function targetFromValue(value: string, targets: ColumnTargetOption[]): ColumnTarget {
  return targets.find((t) => targetOptionValue(t.target) === value)?.target ?? { kind: "ignore" }
}

export default function ImportFormResponsesButton({ meetId, formType }: { meetId: string; formType: FormType }) {
  const router = useRouter()
  const { startTask } = useImportTask()
  const labels = LABELS[formType]

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [error, setError] = useState<string | null>(null)

  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<PickedSpreadsheet | null>(null)
  const [selectedGid, setSelectedGid] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)

  const [mapping, setMapping] = useState<ColumnMapping>([])

  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null)
  const [overrides, setOverrides] = useState<Record<number, string | null>>({})

  function resetForm() {
    setStep(1)
    setError(null)
    setPicking(false)
    setPicked(null)
    setSelectedGid(null)
    setPreview(null)
    setMapping([])
    setDryRun(null)
    setOverrides({})
  }

  async function fetchPreview(accessToken: string, spreadsheetId: string, gid: number | null) {
    setPreviewLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/form-import/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formType, accessToken, spreadsheetId, gid: gid ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that sheet")
      setPreview(data)
      setMapping(data.suggestedMapping)
      if (gid == null) setSelectedGid(data.tabs?.[0]?.gid ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that sheet")
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleChooseSheet() {
    setPicking(true)
    setError(null)
    try {
      const result = await pickSpreadsheet()
      if (!result) return
      setPicked(result)
      setPreview(null)
      setMapping([])
      await fetchPreview(result.accessToken, result.spreadsheetId, null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open Google Drive picker")
    } finally {
      setPicking(false)
    }
  }

  async function handleTabChange(gid: number) {
    setSelectedGid(gid)
    if (picked) await fetchPreview(picked.accessToken, picked.spreadsheetId, gid)
  }

  function updateMapping(index: number, value: string) {
    if (!preview) return
    setMapping((prev) => {
      const next = [...prev]
      next[index] = targetFromValue(value, preview.targets)
      return next
    })
  }

  const mappingValid = useMemo(
    () => mapping.some((t) => t.kind === "athleteName" || t.kind === "athleteEmail"),
    [mapping]
  )

  async function handleRunDryRun() {
    if (!picked) return
    setDryRunLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/form-import/dry-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType,
          accessToken: picked.accessToken,
          spreadsheetId: picked.spreadsheetId,
          gid: selectedGid ?? undefined,
          mapping,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Couldn't preview the import")
      setDryRun(data)
      setOverrides({})
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't preview the import")
    } finally {
      setDryRunLoading(false)
    }
  }

  function resolvedAthleteId(row: DryRunRow): string | null {
    const override = overrides[row.rowNumber]
    return override !== undefined ? override : row.athleteId
  }

  function handleImport() {
    if (!picked) return
    const body = {
      formType,
      accessToken: picked.accessToken,
      spreadsheetId: picked.spreadsheetId,
      gid: selectedGid ?? undefined,
      mapping,
      overrides,
    }
    setOpen(false)
    startTask(
      labels.taskLabel,
      (async () => {
        const res = await fetch(`/api/meets/${meetId}/form-import/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Import failed")
        const parts: string[] = [`Imported ${data.created} new ${labels.verb}${data.created === 1 ? "" : "s"}`]
        if (data.updated > 0) parts.push(`updated ${data.updated}`)
        if (data.skipped > 0) parts.push(`${data.skipped} skipped`)
        if (data.warnings?.length > 0) parts.push(`${data.warnings.length} warning${data.warnings.length === 1 ? "" : "s"}`)
        router.refresh()
        return parts.join(" · ")
      })()
    )
  }

  const readyRows = dryRun?.rows.filter((r) => resolvedAthleteId(r) != null) ?? []
  const attentionRows = dryRun?.rows.filter((r) => resolvedAthleteId(r) == null) ?? []

  const canRunDryRun = !!picked && !previewLoading && mappingValid
  const modalTitle = step === 1 ? labels.title : step === 2 ? "Map columns" : "Review responses"

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm()
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border-secondary rounded-lg hover:border-border hover:bg-fill-tertiary bg-background transition-colors"
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
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        Import from Google Sheets
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={modalTitle}
        description={
          step === 1
            ? `Import ${labels.verb} responses from a Google Form's response sheet.`
            : step === 2
              ? "Match each column to a field. We've suggested a mapping based on the headers."
              : "Confirm the athlete match for each response before importing."
        }
        maxWidth="3xl"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            {step === 1 && (
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!preview || previewLoading}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
              >
                Next: Map columns
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={() => void handleRunDryRun()}
                disabled={!canRunDryRun || dryRunLoading}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
              >
                {dryRunLoading ? "Checking…" : "Next: Review"}
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                onClick={handleImport}
                disabled={!dryRun || readyRows.length === 0}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
              >
                Import {readyRows.length} response{readyRows.length === 1 ? "" : "s"}
              </button>
            )}
          </ModalFooter>
        }
      >
        {step === 1 && (
          <div className="space-y-4">
            {!picked ? (
              <div className="rounded-lg border border-border-secondary px-4 py-3 text-sm space-y-2">
                <p className="text-foreground-secondary">Choose the form&#39;s response spreadsheet from your Google Drive.</p>
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
                {previewLoading ? (
                  <p className="text-sm text-foreground-secondary">Reading sheet…</p>
                ) : preview ? (
                  <>
                    {preview.tabs.length > 1 && (
                      <div>
                        <span className="mb-1 block text-xs font-medium text-foreground-secondary">Tab</span>
                        <select
                          value={selectedGid ?? ""}
                          onChange={(e) => void handleTabChange(Number(e.target.value))}
                          className="w-full rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm outline-none focus:border-border"
                        >
                          {preview.tabs.map((tab) => (
                            <option key={tab.gid} value={tab.gid}>
                              {tab.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <p className="text-sm text-foreground-secondary">
                      {preview.rowCount} response{preview.rowCount === 1 ? "" : "s"} found on &ldquo;{preview.tab}&rdquo;.
                    </p>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-2">
            {preview.headers.map((header, index) => (
              <div key={index} className="rounded-lg border border-border-secondary p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{header || `Column ${index + 1}`}</p>
                    {preview.sampleRows.length > 0 && (
                      <p className="truncate text-xs text-foreground-tertiary">
                        {preview.sampleRows
                          .map((row) => row[index]?.trim())
                          .filter(Boolean)
                          .slice(0, 2)
                          .join(" · ") || "—"}
                      </p>
                    )}
                  </div>
                  <select
                    value={targetOptionValue(mapping[index] ?? { kind: "ignore" })}
                    onChange={(e) => updateMapping(index, e.target.value)}
                    className="w-full shrink-0 rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm outline-none focus:border-border sm:w-64"
                  >
                    {preview.targets.map((option) => (
                      <option key={targetOptionValue(option.target)} value={targetOptionValue(option.target)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            {!mappingValid && (
              <p className="text-sm text-error">Map at least one column to the athlete&#39;s name or email.</p>
            )}
          </div>
        )}

        {step === 3 && dryRun && (
          <div className="space-y-4">
            {dryRun.errors.length > 0 && (
              <div className="rounded-lg border border-border-secondary bg-fill-secondary px-3 py-2 text-sm text-foreground-secondary">
                {dryRun.errors.length} row{dryRun.errors.length === 1 ? "" : "s"} could not be read and will be skipped.
              </div>
            )}

            {attentionRows.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Needs attention ({attentionRows.length})
                </p>
                <div className="space-y-2">
                  {attentionRows.map((row) => (
                    <div key={row.rowNumber} className="rounded-lg border border-border-secondary p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {row.rawName || row.rawEmail || `Row ${row.rowNumber}`}
                          </p>
                          {row.rawEmail && row.rawName && (
                            <p className="truncate text-xs text-foreground-tertiary">{row.rawEmail}</p>
                          )}
                        </div>
                        <select
                          value={overrides[row.rowNumber] ?? row.suggestion?.athleteId ?? ""}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [row.rowNumber]: e.target.value || null,
                            }))
                          }
                          className="w-full shrink-0 rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm outline-none focus:border-border sm:w-56"
                        >
                          <option value="">Skip this row</option>
                          {dryRun.roster.map((athlete) => (
                            <option key={athlete.id} value={athlete.id}>
                              {athlete.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {row.suggestion && overrides[row.rowNumber] === undefined && (
                        <p className="mt-1.5 text-xs text-foreground-tertiary">
                          Possible match: {row.suggestion.lastName}, {row.suggestion.firstName}
                        </p>
                      )}
                      {row.warnings.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-foreground-tertiary">
                          {row.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <details open={attentionRows.length === 0}>
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Ready ({readyRows.length})
              </summary>
              <div className="mt-2 space-y-2">
                {readyRows.map((row) => (
                  <div key={row.rowNumber} className="rounded-lg border border-border-secondary p-3 text-sm">
                    <p className="font-medium text-foreground">{row.rawName || row.rawEmail}</p>
                    {row.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-foreground-tertiary">
                        {row.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}

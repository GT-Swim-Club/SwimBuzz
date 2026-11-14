"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatSeasonLabel } from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { toolbarButtonClass } from "@/components/ui/FluidToolbar"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import {
  useAthletePairing,
  type NameConfirmation,
  type RosterPairingOption,
} from "@/components/meet/AthletePairingProvider"
import type { ClearanceColumnRole, ClearanceColumns } from "@/lib/athlete/clearance-import"
import SheetImportButton, { type SheetImportRun } from "@/app/meets/[id]/SheetImportButton"
import ImportIcon from "../ImportIcon"

type MappingStep = {
  step: "mapping"
  headerRow: number
  headers: string[]
  detected: ClearanceColumns
  sample: string[][]
  rowCount: number
}

type ImportDone = {
  step?: undefined
  pending?: false
  season: string
  imported: number
  noData: number
  unmatched: Array<{ rowNumber: number; label: string }>
  uncleared: number
  rosterSize: number
  warnings: string[]
}

type ClearanceImportResult =
  | MappingStep
  | { step?: undefined; pending: true; nameConfirmations: NameConfirmation[]; rosterForPairing: RosterPairingOption[] }
  | ImportDone

const ROLE_GROUPS: Array<{ title: string; roles: Array<[ClearanceColumnRole, string]> }> = [
  {
    title: "Match athletes by",
    roles: [
      ["gtid", "GTID"],
      ["email", "Email"],
      ["fullName", "Full name"],
      ["firstName", "First name"],
      ["lastName", "Last name"],
    ],
  },
  {
    title: "Physical",
    roles: [
      ["physical", "Status (yes/no or date)"],
      ["physicalDate", "Date"],
    ],
  },
  {
    title: "Concussion test",
    roles: [
      ["concussion", "Status (yes/no or date)"],
      ["concussionDate", "Date"],
    ],
  },
]

function columnLabel(headers: string[], index: number): string {
  const name = headers[index]?.trim()
  const letter = index < 26 ? String.fromCharCode(65 + index) : `#${index + 1}`
  return name ? `${letter} · ${name}` : `Column ${letter}`
}

function mappingProblem(columns: ClearanceColumns): string | null {
  const hasId = (["gtid", "email", "fullName", "firstName", "lastName"] as const).some((r) => columns[r] != null)
  if (!hasId) return "Choose a GTID, email or name column to match athletes by."
  const hasCheck = (["physical", "physicalDate", "concussion", "concussionDate"] as const).some((r) => columns[r] != null)
  if (!hasCheck) return "Choose a physical or concussion test column."
  return null
}

function formatResult(data: ImportDone): string {
  const parts = [`${data.imported} athlete${data.imported === 1 ? "" : "s"} updated`]
  if (data.unmatched.length > 0) parts.push(`${data.unmatched.length} unmatched`)
  parts.push(`${data.uncleared} not cleared`)
  return parts.join(" · ")
}

/**
 * Staff: import physical & concussion clearance from a Google Sheet or CSV. The
 * columns are auto-detected and confirmed before anything is saved; names that
 * don't match go through the usual pairing dialog, and the result lists the rows
 * that matched no one.
 */
export default function ImportClearanceButton({ season }: { season: string }) {
  const router = useRouter()
  const { startTask } = useImportTask()
  const { requestPairing } = useAthletePairing()
  const [mapping, setMapping] = useState<{ run: SheetImportRun<ClearanceImportResult>; data: MappingStep } | null>(null)
  const [columns, setColumns] = useState<ClearanceColumns>({})
  const [result, setResult] = useState<ImportDone | null>(null)

  const endpoint = `/api/clearance/import?season=${encodeURIComponent(season)}`

  function finish(data: ClearanceImportResult): string {
    if (data.step === "mapping" || data.pending) return "Clearance not imported"
    router.refresh()
    if (data.unmatched.length > 0 || data.warnings.length > 0) setResult(data)
    return formatResult(data)
  }

  function runImport(run: SheetImportRun<ClearanceImportResult>, fields: Record<string, unknown>) {
    startTask(
      "Importing clearance…",
      (async () => {
        const data = await run({ fields })
        if (data.step === "mapping") throw new Error("Column mapping was not accepted")
        if (!data.pending) return finish(data)
        // Nothing is saved until the coach pairs (or skips) the unmatched names.
        requestPairing({
          confirmations: data.nameConfirmations,
          roster: data.rosterForPairing,
          description:
            "These names didn't match anyone on the season's roster by GTID, email or name. Pair them to an athlete to import their clearance.",
          occurrenceNoun: ["row", "rows"],
          submitVerb: "Import",
          taskLabel: "Importing clearance…",
          submit: async (nameMappings, rejectedNames) =>
            finish(await run({ fields, nameMappings, rejectedNames, paired: true })),
          onSkip: () =>
            startTask(
              "Importing clearance…",
              (async () =>
                finish(
                  await run({
                    fields,
                    rejectedNames: data.nameConfirmations.map((c) => c.pdfName),
                    paired: true,
                  })
                ))()
            ),
        })
        return `${data.nameConfirmations.length} name${data.nameConfirmations.length === 1 ? "" : "s"} to pair`
      })()
    )
  }

  function confirmMapping(e: React.FormEvent) {
    e.preventDefault()
    if (!mapping || mappingProblem(columns)) return
    const { run, data } = mapping
    setMapping(null)
    runImport(run, { columns, headerRow: data.headerRow })
  }

  const problem = mapping ? mappingProblem(columns) : null

  return (
    <>
      <SheetImportButton<ClearanceImportResult>
        endpoint={endpoint}
        title="Import Clearance"
        description={`Physicals and concussion tests for the ${formatSeasonLabel(season)} roster. You'll confirm the columns before anything is saved.`}
        hint={
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <dt className="font-medium text-foreground">Match by</dt>
            <dd className="text-foreground-secondary">GTID, email, or name (first &amp; last, or full name)</dd>
            <dt className="font-medium text-foreground">Checks</dt>
            <dd className="text-foreground-secondary">
              Physical and concussion test columns — yes/no, ✓, or the date it was done
            </dd>
            <dt className="font-medium text-foreground">Ignored</dt>
            <dd className="text-foreground-secondary">Every other column — only cleared status and dates are saved</dd>
          </dl>
        }
        trigger={(open) => (
          <button type="button" onClick={open} aria-label="Import clearance" className={toolbarButtonClass}>
            <ImportIcon />
            Import
          </button>
        )}
        onImport={(run, sourceLabel) =>
          startTask(
            `Reading clearance sheet (${sourceLabel})…`,
            (async () => {
              const data = await run({})
              if (data.step !== "mapping") return finish(data)
              setColumns(data.detected)
              setMapping({ run, data })
              return "Confirm the columns to import"
            })()
          )
        }
      />

      <Modal
        open={mapping != null}
        onClose={() => setMapping(null)}
        title="Confirm Columns"
        description={
          mapping
            ? `${mapping.data.rowCount} row${mapping.data.rowCount === 1 ? "" : "s"} found. Check which column holds what — detected columns are filled in.`
            : undefined
        }
        maxWidth="xl"
        onSubmit={confirmMapping}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setMapping(null)}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={problem != null}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
            >
              Import
            </button>
          </ModalFooter>
        }
      >
        {mapping && (
          <div className="space-y-4">
            {ROLE_GROUPS.map((group) => (
              <fieldset key={group.title} className="space-y-2">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">{group.title}</legend>
                {group.roles.map(([role, label]) => {
                  const index = columns[role]
                  const example = index != null ? mapping.data.sample.map((r) => r[index]?.trim()).find(Boolean) : null
                  return (
                    <label key={role} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                      <span className="text-sm text-foreground-secondary">{label}</span>
                      <span className="min-w-0">
                        <select
                          value={index ?? ""}
                          onChange={(e) =>
                            setColumns((c) => {
                              const next = { ...c }
                              if (e.target.value === "") delete next[role]
                              else next[role] = Number(e.target.value)
                              return next
                            })
                          }
                          className="w-full rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-border"
                        >
                          <option value="">Not in this sheet</option>
                          {mapping.data.headers.map((_, i) => (
                            <option key={i} value={i}>
                              {columnLabel(mapping.data.headers, i)}
                            </option>
                          ))}
                        </select>
                        {example && (
                          <span className="mt-0.5 block truncate text-xs text-foreground-tertiary">e.g. {example}</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            ))}
            <p className="text-xs text-foreground-tertiary">
              A status cell can say yes/no, ✓, “done”, or hold the date it was done. A blank cell leaves that
              athlete&apos;s check as it is.
            </p>
          </div>
        )}
        {problem && <p className="text-sm text-foreground-secondary">{problem}</p>}
      </Modal>

      <Modal
        open={result != null}
        onClose={() => setResult(null)}
        title="Clearance Imported"
        description={result ? formatResult(result) : undefined}
        maxWidth="lg"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover"
            >
              Done
            </button>
          </ModalFooter>
        }
      >
        {result && (
          <div className="space-y-4 text-sm">
            {result.unmatched.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Unmatched rows ({result.unmatched.length})
                </h3>
                <p className="mt-1 text-foreground-secondary">
                  These rows matched no one on the {formatSeasonLabel(result.season)} roster and weren&apos;t imported.
                </p>
                <ul className="mt-2 divide-y divide-border-secondary rounded-lg border border-border-secondary">
                  {result.unmatched.map((row) => (
                    <li key={row.rowNumber} className="flex items-center gap-3 px-3 py-1.5">
                      <span className="w-14 shrink-0 font-mono text-xs text-foreground-tertiary">Row {row.rowNumber}</span>
                      <span className="min-w-0 truncate text-foreground">{row.label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {result.warnings.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Cells not read ({result.warnings.length})
                </h3>
                <ul className="mt-2 space-y-1 text-foreground-secondary">
                  {result.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

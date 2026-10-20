"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import { useAthletePairing, type NameConfirmation, type RosterPairingOption } from "@/components/meet/AthletePairingProvider"
import SheetImportButton from "./SheetImportButton"

type RosterImportResult =
  | {
      /** Names need pairing; nothing was saved yet. */
      pending: true
      nameConfirmations: NameConfirmation[]
      rosterForPairing: RosterPairingOption[]
    }
  | {
      pending?: false
      imported: number
      removed: number
      attendingAdded: number
      skipped: number
      warnings: string[]
    }

function formatRosterImportResult(data: RosterImportResult) {
  if (data.pending) return "Roster not imported"
  if (data.warnings.length > 0) console.info("[roster import]", data.warnings)
  const parts = [`${data.imported} on roster`]
  if (data.removed > 0) parts.push(`${data.removed} removed from summary`)
  if (data.attendingAdded > 0) parts.push(`${data.attendingAdded} added as attending`)
  if (data.skipped > 0) parts.push(`${data.skipped} skipped`)
  return parts.join(" · ")
}

/**
 * Coach dialog: import the final meet roster (Google Sheet or CSV). Only roster
 * athletes stay on the roster summary and in the relay builder's pool.
 */
export default function ImportMeetRosterButton({
  meetId,
  rosterCount,
  trigger,
}: {
  meetId: string
  /** Athletes on the current final roster, or null if none imported. */
  rosterCount: number | null
  trigger: (open: () => void) => ReactNode
}) {
  const router = useRouter()
  const { startTask } = useImportTask()
  const { requestPairing } = useAthletePairing()
  const endpoint = `/api/meets/${meetId}/roster-import`

  function clearRoster(close: () => void) {
    close()
    startTask(
      "Clearing roster…",
      (async () => {
        const res = await fetch(endpoint, { method: "DELETE" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? "Couldn't clear the roster")
        router.refresh()
        return "Roster cleared"
      })()
    )
  }

  return (
    <SheetImportButton<RosterImportResult>
      endpoint={endpoint}
      title="Import Roster"
      description="Keeps only athletes on the final roster in the roster summary and relay builder. Anyone on it without a sign-up is added as attending."
      csvLabel="Roster CSV"
      hint={
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <dt className="font-medium text-foreground">Required</dt>
          <dd className="text-foreground-secondary">
            Womens Roster / Mens Roster columns (first name, last name next to it), or First &amp; Last Name
          </dd>
          <dt className="font-medium text-foreground">Ignored</dt>
          <dd className="text-foreground-secondary">Drop, Waitlist, Driving?, and other columns</dd>
        </dl>
      }
      status={
        rosterCount != null
          ? (close) => (
              <div className="flex items-center justify-between rounded-lg border border-border-secondary px-4 py-2.5 text-sm">
                <span className="text-foreground-secondary">
                  Current roster: <span className="font-medium text-foreground">{rosterCount} athletes</span>
                </span>
                <button
                  type="button"
                  onClick={() => clearRoster(close)}
                  className="text-xs font-medium text-foreground-secondary hover:text-foreground"
                >
                  Clear roster
                </button>
              </div>
            )
          : undefined
      }
      trigger={trigger}
      onImport={(run, sourceLabel) =>
        startTask(
          `Importing roster (${sourceLabel})…`,
          (async () => {
            const data = await run({})
            if (!data.pending) {
              router.refresh()
              return formatRosterImportResult(data)
            }
            // Nothing is saved until the coach pairs (or skips) the unmatched names.
            requestPairing({
              confirmations: data.nameConfirmations,
              roster: data.rosterForPairing,
              description:
                "These roster names didn't match anyone on the team. Pair them to an athlete to keep them on the meet roster.",
              occurrenceNoun: ["row", "rows"],
              submitVerb: "Import",
              taskLabel: "Importing roster…",
              submit: async (nameMappings, rejectedNames) => {
                const paired = await run({ nameMappings, rejectedNames, paired: true })
                router.refresh()
                return formatRosterImportResult(paired)
              },
              onSkip: () =>
                startTask(
                  "Importing roster…",
                  (async () => {
                    const skipped = await run({
                      rejectedNames: data.nameConfirmations.map((c) => c.pdfName),
                      paired: true,
                    })
                    router.refresh()
                    return formatRosterImportResult(skipped)
                  })()
                ),
            })
            return `${data.nameConfirmations.length} name${data.nameConfirmations.length === 1 ? "" : "s"} to pair`
          })()
        )
      }
    />
  )
}

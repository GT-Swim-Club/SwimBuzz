"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { formatSeasonLabel, type IconName } from "@swimbuzz/shared"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import {
  useAthletePairing,
  type NameConfirmation,
  type RosterPairingOption,
} from "@/components/meet/AthletePairingProvider"
import type { ClearanceImportKind } from "@/lib/athlete/clearance-import"
import SheetImportButton, { type SheetImportRun } from "@/app/meets/[id]/SheetImportButton"

type ImportDone = {
  pending?: false
  season: string
  kind: ClearanceImportKind
  changed: number
  incomplete: number
  complete: number
  unmatched: Array<{ rowNumber: number; label: string }>
  rosterSize: number
  warnings: string[]
}

type ClearanceImportResult =
  | { pending: true; nameConfirmations: NameConfirmation[]; rosterForPairing: RosterPairingOption[] }
  | ImportDone

const KINDS: Record<
  ClearanceImportKind,
  { menuLabel: string; itemLabel: string; icon: IconName; title: string; noun: string; missing: string; pairing: string }
> = {
  physical: {
    menuLabel: "Physicals",
    itemLabel: "Import physicals",
    icon: "stethoscope",
    title: "Import Physicals",
    noun: "physicals",
    missing: "without a physical",
    pairing:
      "These names from Ideal Logic didn't match anyone on the season's roster. Pair them to an athlete so their physical is marked incomplete — anyone left unpaired on the roster is marked complete.",
  },
  concussion: {
    menuLabel: "Concussion tests",
    itemLabel: "Import concussion tests",
    icon: "brain",
    title: "Import Concussion Tests",
    noun: "concussion tests",
    missing: "without a concussion test",
    pairing:
      "These names from the SWAY tracker look close to someone on the season's roster. Pair them to import their concussion test — anyone on the roster left unpaired is marked incomplete.",
  },
}

function formatResult(data: ImportDone): string {
  const parts = [`${data.incomplete} ${KINDS[data.kind].missing}`, `${data.complete} complete`]
  // The SWAY tracker covers the whole club, so its unmatched count is mostly non-swimmers.
  if (data.kind === "physical" && data.unmatched.length > 0) parts.push(`${data.unmatched.length} unmatched`)
  return parts.join(" · ")
}

function ImportHint({ season, kind }: { season: string; kind: ClearanceImportKind }) {
  const roster = `the ${formatSeasonLabel(season)} roster`
  const rows: Array<[string, string]> =
    kind === "physical"
      ? [
          ["Listed", "Physical marked incomplete"],
          ["Not listed", `Physical marked complete for everyone else on ${roster}`],
        ]
      : [
          ["Complete", "SWAY Status “Complete” — concussion test marked complete"],
          ["Incomplete", `Any other status (Not Started, Retake…), or not in the tracker but on ${roster}`],
        ]
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
      {rows.map(([term, detail]) => (
        <div key={term} className="contents">
          <dt className="font-medium text-foreground">{term}</dt>
          <dd className="text-foreground-secondary">{detail}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Staff: the roster "+" menu's clearance imports — physicals from Ideal Logic's medical clearance
 * CSV, or concussion tests from the SWAY tracker CSV. Every athlete on the season roster gets a
 * value; names that don't match go through the usual pairing dialog, and the toast sums up the
 * result. `trigger` renders each menu item.
 */
export default function ClearanceImportItems({
  season,
  trigger,
}: {
  season: string
  trigger: (item: { label: string; icon: IconName }, openDialog: () => void) => ReactNode
}) {
  const router = useRouter()
  const { startTask } = useImportTask()
  const { requestPairing } = useAthletePairing()

  function finish(kind: ClearanceImportKind, data: ClearanceImportResult): string {
    if (data.pending) return `${KINDS[kind].menuLabel} not imported`
    router.refresh()
    return formatResult(data)
  }

  function runImport(kind: ClearanceImportKind, run: SheetImportRun<ClearanceImportResult>) {
    const taskLabel = `Importing ${KINDS[kind].noun}…`
    startTask(
      taskLabel,
      (async () => {
        const data = await run({})
        if (!data.pending) return finish(kind, data)
        // Nothing is saved until the coach pairs (or skips) the unmatched names.
        requestPairing({
          confirmations: data.nameConfirmations,
          roster: data.rosterForPairing,
          description: KINDS[kind].pairing,
          occurrenceNoun: ["row", "rows"],
          submitVerb: "Import",
          taskLabel,
          submit: async (nameMappings, rejectedNames) =>
            finish(kind, await run({ nameMappings, rejectedNames, paired: true })),
          onSkip: () =>
            startTask(
              taskLabel,
              (async () =>
                finish(
                  kind,
                  await run({
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

  return (
    <>
      {(Object.keys(KINDS) as ClearanceImportKind[]).map((kind) => (
        <SheetImportButton<ClearanceImportResult>
          key={kind}
          endpoint={`/api/clearance/import?season=${encodeURIComponent(season)}&kind=${kind}`}
          csvOnly
          title={KINDS[kind].title}
          description={
            kind === "physical"
              ? "Upload CSV from Ideal Logic → Members → Members → Select Incomplete → Medical Clearance → Download Spreadsheet"
              : "Upload the Swim tab of the Club Sports SWAY Tracker as a CSV"
          }
          hint={<ImportHint season={season} kind={kind} />}
          trigger={(openDialog) => trigger({ label: KINDS[kind].itemLabel, icon: KINDS[kind].icon }, openDialog)}
          onImport={(run) => runImport(kind, run)}
        />
      ))}
    </>
  )
}

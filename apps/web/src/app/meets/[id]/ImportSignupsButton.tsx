"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import { useAthletePairing, type NameConfirmation, type RosterPairingOption } from "@/components/meet/AthletePairingProvider"
import SheetImportButton from "./SheetImportButton"

type SignupImportResult = {
  imported: number
  entries: number
  attendingOnly: number
  skipped: number
  /** Sign-ups left off the summary because they aren't on the final roster. */
  notOnRoster: number
  warnings: string[]
  nameConfirmations?: NameConfirmation[]
  rosterForPairing?: RosterPairingOption[]
}

function formatSignupImportResult(data: SignupImportResult) {
  const parts = [`Imported ${data.imported} sign-up${data.imported === 1 ? "" : "s"}`]
  parts.push(`${data.entries} entr${data.entries === 1 ? "y" : "ies"}`)
  if (data.attendingOnly > 0) parts.push(`${data.attendingOnly} attending only`)
  if (data.notOnRoster > 0) parts.push(`${data.notOnRoster} not on roster`)
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

  return (
    <SheetImportButton<SignupImportResult>
      endpoint={`/api/meets/${meetId}/signup-import`}
      title="Import Sign-ups"
      description="Adds each response's events and entry times to the roster summary, replacing the last sign-up import."
      csvLabel="Sign-ups CSV"
      hint={
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <dt className="font-medium text-foreground">Required</dt>
          <dd className="text-foreground-secondary">
            First &amp; Last Name or GT Email, Event Number 1, 2, …
          </dd>
          <dt className="font-medium text-foreground">Recommended</dt>
          <dd className="text-foreground-secondary">Event N Entry Time, Relay Preferences</dd>
        </dl>
      }
      trigger={trigger}
      onImport={(run, sourceLabel) =>
        startTask(
          `Importing sign-ups (${sourceLabel})…`,
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
    />
  )
}

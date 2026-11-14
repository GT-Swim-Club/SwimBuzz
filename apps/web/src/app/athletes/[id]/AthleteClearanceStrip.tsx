"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CLEARANCE_CHECK_LABEL,
  CLEARANCE_CHECKS,
  formatClearanceDate,
  formatSeasonLabel,
  missingClearance,
  type ClearanceListAthlete,
} from "@swimbuzz/shared"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { WarningGlyph } from "@/components/athlete/ClearanceFlag"
import EditClearanceModal from "../clearance/EditClearanceModal"

/** Physical & concussion test status for one season; staff can correct it by hand. */
export default function AthleteClearanceStrip({
  status,
  canEdit,
}: {
  status: ClearanceListAthlete
  canEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const missing = missingClearance(status)

  return (
    <section
      aria-label="Physical and concussion clearance"
      className={
        "flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3 text-sm " +
        (missing.length > 0 ? "border-warning-border bg-warning-bg" : "border-border bg-background")
      }
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-accent">
        Clearance · {formatSeasonLabel(status.season)}
      </span>
      {CLEARANCE_CHECKS.map((check) => {
        const item = status[check]
        return (
          <span key={check} className="inline-flex items-center gap-1.5">
            {item.cleared ? (
              <ActionIcon kind="check" className="h-3.5 w-3.5 shrink-0 text-success-text" />
            ) : (
              <WarningGlyph className="h-3.5 w-3.5 shrink-0 text-warning-text" />
            )}
            <span className="text-foreground-secondary">{CLEARANCE_CHECK_LABEL[check]}:</span>
            <span className="font-medium text-foreground">
              {item.cleared ? formatClearanceDate(item.date) ?? "On file" : "Not on file"}
            </span>
          </span>
        )
      })}
      {!canEdit && missing.length > 0 && (
        <span className="text-foreground-secondary">Check with your coaches before practice.</span>
      )}
      {canEdit && (
        <span className="ml-auto flex items-center gap-1">
          <Link
            href={`/athletes/clearance?season=${encodeURIComponent(status.season)}`}
            className="text-xs font-medium text-foreground-secondary transition-colors hover:text-foreground"
          >
            Clearance list
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit clearance"
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-fill-secondary hover:text-foreground"
          >
            <ActionIcon kind="edit" className="h-4 w-4" />
            <HoverDetail label="Edit clearance" />
          </button>
        </span>
      )}
      {canEdit && (
        <EditClearanceModal
          athlete={editing ? status : null}
          season={status.season}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            router.refresh()
          }}
        />
      )}
    </section>
  )
}

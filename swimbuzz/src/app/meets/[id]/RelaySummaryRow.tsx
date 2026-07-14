"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import type { SheetEntry } from "@/lib/meet-sheet-summary"
import SummaryRowLayout from "@/components/SummaryRowLayout"
import { EditRelayButton, RelayDetailModal } from "./MeetRelayEditor"

export default function RelaySummaryRow({
  entry,
  label,
  details,
  coachNote,
  timeDisplay,
  detailTitle,
  rowClassName,
  canEdit,
  meetId,
  athletes = [],
}: {
  entry: SheetEntry
  label: string
  details?: string
  coachNote?: string
  timeDisplay: ReactNode
  detailTitle: string
  rowClassName?: string
  canEdit?: boolean
  meetId?: string
  athletes?: Array<{ id: string; name: string; gender?: "M" | "F" }>
}) {
  const [detailOpen, setDetailOpen] = useState(false)

  return (
    <>
      <SummaryRowLayout
        className={rowClassName}
        label={label}
        details={details}
        coachNote={coachNote}
        onClick={() => setDetailOpen(true)}
        right={
          <>
            {timeDisplay}
            {canEdit && meetId ? (
              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <EditRelayButton
                  meetId={meetId}
                  athletes={athletes}
                  entry={entry}
                />
              </div>
            ) : null}
          </>
        }
      />
      {detailOpen ? (
        <RelayDetailModal
          entry={entry}
          title={detailTitle}
          timeDisplay={timeDisplay}
          coachNote={coachNote}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </>
  )
}

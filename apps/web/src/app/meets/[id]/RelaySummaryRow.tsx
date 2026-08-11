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
  id,
  swimInfo,
}: {
  entry: SheetEntry
  label: ReactNode
  details?: string
  coachNote?: string
  timeDisplay: ReactNode
  detailTitle: string
  rowClassName?: string
  canEdit?: boolean
  meetId?: string
  athletes?: Array<{ id: string; name: string; gender?: "M" | "F" }>
  id?: string
  swimInfo?: {
    seedTime?: string
    rank?: number | string
    heat?: number | string
    lane?: number
    resultPlace?: number
    time?: string
    rawTime?: string
  }
}) {
  const [detailOpen, setDetailOpen] = useState(false)

  return (
    <>
      <SummaryRowLayout
        id={id}
        className={rowClassName}
        label={label}
        details={details}
        coachNote={coachNote}
        onClick={() => setDetailOpen(true)}
        right={
          <>
            <span key="time" className="cursor-pointer">{timeDisplay}</span>
            {canEdit && meetId ? (
              <div key="edit" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
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
          swimInfo={swimInfo}
          rawTime={swimInfo?.rawTime}
        />
      ) : null}
    </>
  )
}

"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import type { ResultSplit } from "@/lib/meet-sheet-summary"
import SummaryRowLayout from "@/components/SummaryRowLayout"
import IndividualSplitsModal from "./IndividualSplitsModal"

export default function IndividualSummaryRow({
  athleteName,
  athleteId,
  label,
  details,
  timeDisplay,
  detailTitle,
  rowClassName,
  splits,
  editButton,
  id,
  swimInfo,
}: {
  athleteName?: string
  athleteId?: string
  label: ReactNode,
  details?: string
  timeDisplay: ReactNode
  detailTitle: string
  rowClassName?: string
  splits: ResultSplit[]
  editButton?: ReactNode
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
        onClick={() => setDetailOpen(true)}
        right={
          <>
            <span key="time" className="cursor-pointer">{timeDisplay}</span>
            {editButton ? (
              <div key="edit" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {editButton}
              </div>
            ) : null}
          </>
        }
      />
      {detailOpen ? (
        <IndividualSplitsModal
          athleteName={athleteName}
          athleteId={athleteId}
          title={detailTitle}
          timeDisplay={timeDisplay}
          splits={splits}
          swimInfo={swimInfo}
          rawTime={swimInfo?.rawTime}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </>
  )
}

"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import type { ResultSplit } from "@/lib/meet-sheet-summary"
import SummaryRowLayout from "@/components/SummaryRowLayout"
import IndividualSplitsModal from "./IndividualSplitsModal"

export default function IndividualSummaryRow({
  athleteName,
  label,
  details,
  timeDisplay,
  detailTitle,
  rowClassName,
  splits,
  editButton,
  id,
}: {
  athleteName?: string
  label: string
  details?: string
  timeDisplay: ReactNode
  detailTitle: string
  rowClassName?: string
  splits: ResultSplit[]
  editButton?: ReactNode
  id?: string
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const hasSplits = splits.length > 0

  return (
    <>
      <SummaryRowLayout
        id={id}
        className={rowClassName}
        label={label}
        details={details}
        onClick={hasSplits ? () => setDetailOpen(true) : undefined}
        right={
          <>
            <span key="time">{timeDisplay}</span>
            {editButton ? (
              <div key="edit" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {editButton}
              </div>
            ) : null}
          </>
        }
      />
      {detailOpen && hasSplits ? (
        <IndividualSplitsModal
          athleteName={athleteName}
          title={detailTitle}
          timeDisplay={timeDisplay}
          splits={splits}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </>
  )
}

"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import type { ResultSplit } from "@/lib/meet-sheet-summary"
import SummaryRowLayout from "@/components/SummaryRowLayout"
import IndividualSplitsModal, {
  type ResultRoundSection,
} from "./IndividualSplitsModal"

function hashMatchesId(id: string) {
  const hashes = window.location.hash.split("#").filter(Boolean)
  return hashes[hashes.length - 1] === id
}

export default function IndividualSummaryRow({
  athleteName,
  athleteId,
  athleteSlug,
  label,
  details,
  timeDisplay,
  detailTitle,
  rowClassName,
  splits,
  editButton,
  id,
  swimInfo,
  rounds,
}: {
  athleteName?: string
  athleteId?: string
  athleteSlug?: string | null
  label: ReactNode
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
  rounds?: ResultRoundSection[]
}) {
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    const openIfHash = () => {
      if (hashMatchesId(id)) setDetailOpen(true)
    }
    openIfHash()
    window.addEventListener("hashchange", openIfHash)
    return () => window.removeEventListener("hashchange", openIfHash)
  }, [id])

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
              <div
                key="edit"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
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
          athleteSlug={athleteSlug}
          title={detailTitle}
          timeDisplay={timeDisplay}
          splits={splits}
          swimInfo={swimInfo}
          rawTime={swimInfo?.rawTime}
          rounds={rounds}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </>
  )
}

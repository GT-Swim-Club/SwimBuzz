"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createApiClient } from "@swimbuzz/api"
import {
  formatRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordItem,
} from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { Skeleton } from "@/components/ui/Skeleton"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import { athletePath, meetPath } from "@/lib/slug"

const api = createApiClient({})

function genderTitle(gender: RecordGender): string {
  return gender === "F" ? "Women's" : gender === "M" ? "Men's" : ""
}

/**
 * An event's records, newest first; the first is the current record. Read-only: records come from
 * imported meet results and the records sheet. (Top 10s live in the records page's Top 10 view.)
 */
export default function RecordHistoryModal({
  def,
  gender: initialGender,
  onClose,
}: {
  def: RecordEventDef
  gender: RecordGender
  onClose: () => void
}) {
  const [gender, setGender] = useState(initialGender)
  const [records, setRecords] = useState<TeamRecordItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getRecordHistory(gender, def.event)
      .then((res) => !cancelled && setRecords(res.records))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load history"))
    return () => {
      cancelled = true
    }
  }, [gender, def.event])

  function changeGender(next: RecordGender) {
    setGender(next)
    setRecords(null)
    setError(null)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${genderTitle(gender)} ${def.label}`.trim()}
      description="Record history, newest first"
      maxWidth="md"
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill"
          >
            Close
          </button>
        </ModalFooter>
      }
    >
      {def.genders.length > 1 ? (
        <SegmentedToggle
          selectedIndex={def.genders.indexOf(gender)}
          fullWidth
          className="rounded-lg border border-border bg-background"
        >
          {def.genders.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={g === gender}
              onClick={() => changeGender(g)}
              className={segmentedOptionClass(g === gender)}
            >
              {g === "F" ? "Women" : "Men"}
            </button>
          ))}
        </SegmentedToggle>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {records === null && !error ? (
        <ul className="divide-y divide-border rounded-xl border border-border-secondary">
          {["w-32", "w-40", "w-28"].map((w, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-3">
              <div className="space-y-1.5">
                <Skeleton className={`h-4 ${w}`} />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-4 w-14" />
            </li>
          ))}
        </ul>
      ) : null}

      {records?.length === 0 ? (
        <p className="text-sm text-foreground-secondary">No record yet.</p>
      ) : null}

      {records && records.length > 0 ? (
        <ol className="divide-y divide-border rounded-xl border border-border">
          {records.map((record, index) => (
            <li key={record.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {record.swimmers.map((swimmer, i) =>
                    swimmer.athleteSlug ? (
                      <Link
                        key={i}
                        href={athletePath(swimmer.athleteSlug)}
                        className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {recordSwimmerLabel(record, swimmer)}
                      </Link>
                    ) : (
                      <span key={i} className="text-sm font-medium text-foreground">
                        {recordSwimmerLabel(record, swimmer)}
                      </span>
                    )
                  )}
                  {index === 0 ? (
                    <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-4 text-primary-contrast">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="text-[13px] text-foreground-secondary">
                  {record.meetSlug && record.meetName ? (
                    <>
                      {recordSetLabel({ ...record, meetName: null })} ·{" "}
                      <Link href={meetPath(record.meetSlug)} className="hover:text-primary hover:underline">
                        {record.meetName}
                      </Link>
                    </>
                  ) : (
                    recordSetLabel(record)
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 font-mono text-sm tabular-nums ${record.isThisSeason ? "font-semibold text-accent" : "text-foreground"}`}
              >
                {formatRecordTime(record.timeMs)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </Modal>
  )
}

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
  type TeamRecordSource,
} from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { Skeleton } from "@/components/ui/Skeleton"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import { athletePath, meetPath } from "@/lib/slug"

const api = createApiClient({})

const SOURCE_LABELS: Record<TeamRecordSource, string> = {
  meet: "From meet results",
  manual: "Set by staff",
  seed: "Records sheet",
}

function genderTitle(gender: RecordGender): string {
  return gender === "F" ? "Women's" : gender === "M" ? "Men's" : ""
}

/** An event's records, newest first; staff can remove one (the record before it takes its place). */
export default function RecordHistoryModal({
  def,
  gender: initialGender,
  canEdit,
  onClose,
  onChanged,
}: {
  def: RecordEventDef
  gender: RecordGender
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [gender, setGender] = useState(initialGender)
  const [records, setRecords] = useState<TeamRecordItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

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

  async function remove(id: string) {
    setRemoving(true)
    try {
      await api.removeRecord(id)
      setRecords((await api.getRecordHistory(gender, def.event)).records)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the record")
    } finally {
      setRemoving(false)
      setConfirming(null)
    }
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
                <p className="text-xs text-foreground-tertiary">{SOURCE_LABELS[record.source]}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={`font-mono text-sm tabular-nums ${record.isThisSeason ? "font-semibold text-accent" : "text-foreground"}`}>
                  {formatRecordTime(record.timeMs)}
                </span>
                {canEdit ? (
                  confirming === record.id ? (
                    <span className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => remove(record.id)}
                        className="rounded-md bg-error px-2 py-1 font-medium text-error-contrast hover:bg-error-hover disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => setConfirming(null)}
                        className="rounded-md px-2 py-1 text-foreground-secondary hover:bg-fill-secondary hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label="Remove record"
                      onClick={() => setConfirming(record.id)}
                      className="group relative inline-flex size-7 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-error"
                    >
                      <AppIcon name="trash" className="h-4 w-4" />
                      <HoverDetail label="Remove record" />
                    </button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </Modal>
  )
}

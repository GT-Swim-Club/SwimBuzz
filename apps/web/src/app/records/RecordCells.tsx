"use client"

import {
  formatRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordItem,
} from "@swimbuzz/shared"
import HoverDetail from "@/components/ui/HoverDetail"
import ManualRecordMark from "@/components/ui/ManualRecordMark"
import { meetRelayPath, meetSwimPath } from "@/lib/slug"

export type SideProps = { def: RecordEventDef; gender: RecordGender; record: TeamRecordItem | undefined }

/**
 * Where a record goes: its meet page, opened on the swim (`#swim-<id>`, which a relay leadoff opens
 * as its relay) or the relay, like a Top 10 row. Null for a record with no imported swim or relay.
 */
export function recordHref(record: TeamRecordItem | undefined): string | null {
  if (!record?.meetSlug) return null
  if (record.swimId) return meetSwimPath(record.meetSlug, record.swimId)
  if (record.relayKey) return meetRelayPath(record.meetSlug, record.relayKey)
  return null
}

/** This season's records in bold gold, like the bold italic on the records sheet. */
export function seasonClass(record: TeamRecordItem | undefined): string {
  return record?.isThisSeason ? "font-semibold text-accent" : "text-foreground"
}

export function RecordYear({ record, className = "" }: SideProps & { className?: string }) {
  if (!record) return <span className={`text-foreground-tertiary ${className}`}>—</span>
  return (
    <span className={`relative tabular-nums ${seasonClass(record)} ${className}`}>
      {record.year}
      <HoverDetail label={recordSetLabel(record)} />
    </span>
  )
}

export function RecordTime({ record, className = "" }: SideProps & { className?: string }) {
  if (!record) return <span className={`text-foreground-tertiary ${className}`}>—</span>
  return (
    <span className={`font-mono tabular-nums ${seasonClass(record)} ${className}`}>
      <ManualRecordMark manual={record.manual} />
      {formatRecordTime(record.timeMs)}
    </span>
  )
}

/** Holder (or relay legs 1–4, one per line), as plain text: names don't link to athletes. */
export function RecordNames({
  record,
  className = "",
  align = "center",
}: SideProps & { className?: string; align?: "center" | "start" }) {
  if (!record) return <span className={`text-foreground-tertiary ${className}`}>—</span>
  const alignClass = align === "center" ? "items-center text-center" : "items-start text-left"
  return (
    <div className={`flex min-w-0 flex-col ${alignClass} ${seasonClass(record)} ${className}`}>
      {record.swimmers.map((swimmer, i) => {
        const text = recordSwimmerLabel(record, swimmer)
        return (
          <span key={i} className="max-w-full truncate">
            {text}
          </span>
        )
      })}
    </div>
  )
}

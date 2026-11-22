"use client"

import Link from "next/link"
import {
  formatRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordItem,
} from "@swimbuzz/shared"
import HoverDetail from "@/components/ui/HoverDetail"
import { athletePath } from "@/lib/slug"

export type SideProps = { def: RecordEventDef; gender: RecordGender; record: TeamRecordItem | undefined }

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
  return <span className={`font-mono tabular-nums ${seasonClass(record)} ${className}`}>{formatRecordTime(record.timeMs)}</span>
}

/** Holder (or relay legs 1–4, one per line), linking to roster athletes. */
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
        return swimmer.athleteSlug ? (
          <Link key={i} href={athletePath(swimmer.athleteSlug)} className="max-w-full truncate transition-colors hover:text-primary hover:underline">
            {text}
          </Link>
        ) : (
          <span key={i} className="max-w-full truncate">
            {text}
          </span>
        )
      })}
    </div>
  )
}

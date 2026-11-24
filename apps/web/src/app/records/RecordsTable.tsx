"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import type { RecordEventDef, RecordGender, TeamRecordRow } from "@swimbuzz/shared"
import { ledgerHeaderClass } from "@/components/meet/Ledger"
import { RecordNames, RecordTime, RecordYear, recordHref, type SideProps } from "./RecordCells"

/** Year · Name · Time | Event | Time · Name · Year, mirrored like the records sheet. */
const COLS = "grid-cols-[4.5rem_minmax(0,1fr)_6rem_minmax(13rem,15rem)_6rem_minmax(0,1fr)_4.5rem]"

const cellClass = "flex min-w-0 items-center justify-center px-2 py-2 text-[15px]"
const columnLabelClass = "px-2 py-1.5 text-center text-[11px] font-semibold tracking-[0.11em] text-foreground-tertiary"

/**
 * One gender's cells, in reading order from the outside edge in (women) or the center out (men).
 * A record with an imported swim or relay links to it on its meet page, like a Top 10 row.
 */
function SideCells({ side, mirrored }: { side: SideProps; mirrored: boolean }) {
  const href = recordHref(side.record)
  const cells = [
    <div key="year" className={cellClass}>
      <RecordYear {...side} />
    </div>,
    <div key="names" className={`${cellClass} flex-col`}>
      <RecordNames {...side} className="w-full" linkNames={!href} />
    </div>,
    <div key="time" className={cellClass}>
      <RecordTime {...side} />
    </div>,
  ]
  if (mirrored) cells.reverse()
  if (!href) return <>{cells}</>
  return (
    <Link href={href} className="col-span-3 grid grid-cols-subgrid transition-colors hover:bg-background-hover">
      {cells}
    </Link>
  )
}

function SideHeader({ mirrored }: { mirrored: boolean }) {
  const labels = ["YEAR", "NAME", "TIME"]
  return (mirrored ? labels.reverse() : labels).map((label) => (
    <span key={label} className={columnLabelClass}>
      {label}
    </span>
  ))
}

/** The records sheet layout, for wide screens (lg+). */
export default function RecordsTable({
  rows,
  action,
  onOpenHistory,
}: {
  rows: TeamRecordRow[]
  action?: ReactNode
  onOpenHistory: (def: RecordEventDef, gender: RecordGender) => void
}) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-background shadow-sm lg:block">
      <div className={`grid ${COLS} border-b border-border bg-fill-secondary/60`}>
        <h2 className={`col-span-3 py-3 text-center ${ledgerHeaderClass}`}>Women&apos;s Records</h2>
        <p className={`whitespace-nowrap border-x border-border px-2 py-3 text-center ${ledgerHeaderClass}`}>Georgia Tech Swim Club</p>
        <div className="relative col-span-3 flex items-center justify-center">
          <h2 className={`py-3 text-center ${ledgerHeaderClass}`}>Men&apos;s Records</h2>
          {/* z-20: the translate makes this its own stacking context, so the share menu's z-index only
              counts inside it — without this the rows below (positioned year cells) paint over the menu. */}
          {action ? <div className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1">{action}</div> : null}
        </div>
      </div>
      <div className={`grid ${COLS} border-b border-fill`}>
        <SideHeader mirrored={false} />
        <span className={`${columnLabelClass} border-x border-border`}>EVENT</span>
        <SideHeader mirrored />
      </div>

      {rows.map((row, index) => {
        const groupStart = index > 0 && rows[index - 1]!.group !== row.group
        const mixed = row.genders.length === 1 && row.genders[0] === "X"
        const side = (gender: RecordGender): SideProps => ({ def: row, gender, record: row.records[gender] })
        return (
          <div
            key={`${row.genders.join("")}|${row.event}`}
            className={`grid ${COLS} ${index === 0 ? "" : groupStart || row.relay ? "border-t border-fill" : "border-t border-border"}`}
          >
            <SideCells side={side(mixed ? "X" : "F")} mirrored={false} />
            <button
              type="button"
              onClick={() => onOpenHistory(row, row.genders[0]!)}
              className="flex items-center justify-center border-x border-border px-2 py-2 text-center text-[15px] font-medium text-foreground transition-colors hover:bg-background-hover hover:text-primary"
            >
              {row.label}
            </button>
            {mixed ? <div aria-hidden className="col-span-3 bg-fill" /> : <SideCells side={side("M")} mirrored />}
          </div>
        )
      })}
    </div>
  )
}

"use client"

import { useContext, type ReactNode } from "react"
import type { RecordGender, TeamRecordRow } from "@swimbuzz/shared"
import { ledgerHeaderClass } from "@/components/meet/Ledger"
import {
  RecordActions,
  RecordNames,
  RecordsEditingContext,
  RecordSide,
  RecordTime,
  RecordYear,
  type SideProps,
} from "./RecordCells"

/** Year · Name · Time | Event | Time · Name · Year, mirrored like the records sheet; editing adds an actions column at each edge. */
const COLS = "grid-cols-[4.5rem_minmax(0,1fr)_6rem_minmax(13rem,15rem)_6rem_minmax(0,1fr)_4.5rem]"
const EDIT_COLS =
  "grid-cols-[2.5rem_5rem_minmax(0,1fr)_6.5rem_minmax(13rem,15rem)_6.5rem_minmax(0,1fr)_5rem_2.5rem]"

const cellClass = "flex min-w-0 items-center justify-center px-2 py-2 text-[15px]"
const columnLabelClass = "px-2 py-1.5 text-center text-[11px] font-semibold tracking-[0.11em] text-foreground-tertiary"

/** One gender's cells, in reading order from the outside edge in (women) or the center out (men). */
function SideCells({ side, mirrored, editing }: { side: SideProps; mirrored: boolean; editing: boolean }) {
  const cells = [
    editing ? (
      <div key="actions" className="flex items-center justify-center py-2">
        <RecordActions {...side} />
      </div>
    ) : null,
    <div key="year" className={cellClass}>
      <RecordYear {...side} />
    </div>,
    <div key="names" className={`${cellClass} flex-col`}>
      <RecordNames {...side} className="w-full" />
    </div>,
    <div key="time" className={cellClass}>
      <RecordTime {...side} />
    </div>,
  ]
  return <RecordSide {...side}>{mirrored ? cells.reverse() : cells}</RecordSide>
}

function SideHeader({ editing, mirrored }: { editing: boolean; mirrored: boolean }) {
  const labels = [editing ? "" : null, "YEAR", "NAME", "TIME"].filter((l): l is string => l !== null)
  return (mirrored ? labels.reverse() : labels).map((label, i) => (
    <span key={i} className={columnLabelClass}>
      {label}
    </span>
  ))
}

/** The records sheet layout, for wide screens (lg+). */
export default function RecordsTable({ rows, action }: { rows: TeamRecordRow[]; action?: ReactNode }) {
  const editing = useContext(RecordsEditingContext)!
  const cols = editing.editing ? EDIT_COLS : COLS
  const sideSpan = editing.editing ? "col-span-4" : "col-span-3"

  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-background shadow-sm lg:block">
      <div className={`grid ${cols} border-b border-border bg-fill-secondary/60`}>
        <h2 className={`${sideSpan} py-3 text-center ${ledgerHeaderClass}`}>Women&apos;s Records</h2>
        <p className={`whitespace-nowrap border-x border-border px-2 py-3 text-center ${ledgerHeaderClass}`}>Georgia Tech Swim Club</p>
        <div className={`${sideSpan} relative flex items-center justify-center`}>
          <h2 className={`py-3 text-center ${ledgerHeaderClass}`}>Men&apos;s Records</h2>
          {action ? <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">{action}</div> : null}
        </div>
      </div>
      <div className={`grid ${cols} border-b border-fill`}>
        <SideHeader editing={editing.editing} mirrored={false} />
        <span className={`${columnLabelClass} border-x border-border`}>EVENT</span>
        <SideHeader editing={editing.editing} mirrored />
      </div>

      {rows.map((row, index) => {
        const groupStart = index > 0 && rows[index - 1]!.group !== row.group
        const mixed = row.genders.length === 1 && row.genders[0] === "X"
        const side = (gender: RecordGender): SideProps => ({ def: row, gender, record: row.records[gender] })
        return (
          <div
            key={`${row.genders.join("")}|${row.event}`}
            className={`grid ${cols} ${index === 0 ? "" : groupStart || row.relay ? "border-t border-fill" : "border-t border-border"}`}
          >
            <SideCells side={side(mixed ? "X" : "F")} mirrored={false} editing={editing.editing} />
            <button
              type="button"
              onClick={() => editing.openHistory(row, row.genders[0]!)}
              className="flex items-center justify-center border-x border-border px-2 py-2 text-center text-[15px] font-medium text-foreground transition-colors hover:bg-background-hover hover:text-primary"
            >
              {row.label}
            </button>
            {mixed ? (
              <div aria-hidden className={`${sideSpan} bg-fill`} />
            ) : (
              <SideCells side={side("M")} mirrored editing={editing.editing} />
            )}
          </div>
        )
      })}
    </div>
  )
}

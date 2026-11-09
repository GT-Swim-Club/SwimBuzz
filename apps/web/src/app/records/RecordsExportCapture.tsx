"use client"

import {
  RECORDS_EXPORT,
  recordSwimmerName,
  recordTimeLabel,
  type RecordGender,
  type TeamRecordItem,
  type TeamRecordRow,
} from "@swimbuzz/shared"
import { seasonClass } from "./RecordCells"

/** Year · Name · Time | Event | Time · Name · Year, on a fixed-width sheet so every row's columns line up. */
const COLS = "grid-cols-[4.5rem_minmax(0,1fr)_7.5rem_17rem_7.5rem_minmax(0,1fr)_4.5rem]"
const SHEET_WIDTH_PX = 1160
/** The ledger's gold caps, larger for the sheet's header band (the event column fits the club's name). */
const bandClass = "text-base font-semibold uppercase tracking-[0.1em] text-accent"
// Tight rows like the club's records spreadsheet: a relay's four legs stack at the line height.
const cellClass = "flex min-w-0 items-center justify-center whitespace-nowrap px-3 py-1 text-[15px] leading-[22px]"
const columnLabelClass = "px-2 py-1 text-center text-[11px] font-semibold tracking-[0.11em] text-foreground-tertiary"

/** One gender's year, names and time, from the outside edge in (women) or the center out (men). */
function SideCells({ record, mirrored }: { record: TeamRecordItem | undefined; mirrored: boolean }) {
  const empty = <span className="text-foreground-tertiary">—</span>
  const cells = [
    <div key="year" className={`${cellClass} tabular-nums ${seasonClass(record)}`}>
      {record ? record.year : empty}
    </div>,
    <div key="names" className={`${cellClass} flex-col ${seasonClass(record)}`}>
      {record
        ? record.swimmers.map((swimmer, i) => (
            <span key={i} className="max-w-full truncate">
              {recordSwimmerName(swimmer)}
            </span>
          ))
        : empty}
    </div>,
    <div key="time" className={`${cellClass} font-mono tabular-nums ${seasonClass(record)}`}>
      {record ? recordTimeLabel(record) : empty}
    </div>,
  ]
  return <>{mirrored ? cells.reverse() : cells}</>
}

/**
 * Off-screen copy of the records sheet for PNG export, both genders side by side like the wide
 * table, with the date in the mixed relay's empty men's cell at the bottom right. Not shown in the
 * page layout.
 */
export default function RecordsExportCapture({ rows, asOf }: { rows: TeamRecordRow[]; asOf: string }) {
  return (
    <div className="w-fit bg-background p-3 text-foreground">
      <div className="overflow-hidden rounded-xl border border-border bg-background" style={{ width: SHEET_WIDTH_PX }}>
        <div className={`grid ${COLS} border-b border-border bg-fill-secondary/60`}>
          <p className={`col-span-3 py-2.5 text-center ${bandClass}`}>Women&apos;s Records</p>
          <p className={`whitespace-nowrap border-x border-border px-2 py-2.5 text-center ${bandClass}`}>
            {RECORDS_EXPORT.eyebrow}
          </p>
          <p className={`col-span-3 py-2.5 text-center ${bandClass}`}>Men&apos;s Records</p>
        </div>
        <div className={`grid ${COLS} border-b border-fill`}>
          {["YEAR", "NAME", "TIME"].map((label) => (
            <span key={label} className={columnLabelClass}>
              {label}
            </span>
          ))}
          <span className={`${columnLabelClass} border-x border-border`}>EVENT</span>
          {["TIME", "NAME", "YEAR"].map((label) => (
            <span key={label} className={columnLabelClass}>
              {label}
            </span>
          ))}
        </div>

        {rows.map((row, index) => {
          const groupStart = index > 0 && rows[index - 1]!.group !== row.group
          const mixed = row.genders.length === 1 && row.genders[0] === "X"
          const record = (gender: RecordGender) => row.records[gender]
          return (
            <div
              key={`${row.genders.join("")}|${row.event}`}
              className={`grid ${COLS} ${index === 0 ? "" : groupStart || row.relay ? "border-t border-fill" : "border-t border-border"}`}
            >
              <SideCells record={record(mixed ? "X" : "F")} mirrored={false} />
              <div className="flex items-center justify-center whitespace-nowrap border-x border-border px-4 py-1 text-center text-[15px] leading-[22px] font-medium text-foreground">
                {row.label}
              </div>
              {mixed ? (
                <div className="col-span-3 flex items-end justify-end px-3 py-2 text-sm text-foreground-secondary">
                  {asOf}
                </div>
              ) : (
                <SideCells record={record("M")} mirrored />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

"use client"

import { useContext, type ReactNode } from "react"
import type { RecordGender, RecordGroup, TeamRecordRow } from "@swimbuzz/shared"
import { ledgerHeaderClass } from "@/components/meet/Ledger"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import {
  RecordActions,
  RecordNames,
  RecordsEditingContext,
  RecordSide,
  RecordTime,
  RecordYear,
  type SideProps,
} from "./RecordCells"

const GENDERS = [
  { value: "F", label: "Women" },
  { value: "M", label: "Men" },
] as const

/** Phones and narrow windows (below lg): one gender at a time, an event per row, grouped by stroke. */
export default function RecordsList({
  rows,
  gender,
  onGenderChange,
  action,
}: {
  rows: TeamRecordRow[]
  gender: "F" | "M"
  onGenderChange: (gender: "F" | "M") => void
  action?: ReactNode
}) {
  const editing = useContext(RecordsEditingContext)!
  // The mixed relay is both teams' record, so it shows under either.
  const shown = rows.filter((row) => row.genders.includes(gender) || row.genders.includes("X"))
  const groups = shown.reduce<Array<{ group: RecordGroup; rows: TeamRecordRow[] }>>((out, row) => {
    const last = out.at(-1)
    if (last?.group === row.group) last.rows.push(row)
    else out.push({ group: row.group, rows: [row] })
    return out
  }, [])

  return (
    <div className="flex flex-col gap-4 lg:hidden">
      <div className="flex items-center gap-2">
        <SegmentedToggle
          selectedIndex={GENDERS.findIndex((g) => g.value === gender)}
          fullWidth
          className="min-w-0 flex-1 rounded-lg border border-border bg-background sm:max-w-xs"
        >
          {GENDERS.map((g) => (
            <button
              key={g.value}
              type="button"
              aria-pressed={g.value === gender}
              onClick={() => onGenderChange(g.value)}
              className={segmentedOptionClass(g.value === gender)}
            >
              {g.label}
            </button>
          ))}
        </SegmentedToggle>
        {action ? <div className="ml-auto flex items-center gap-1">{action}</div> : null}
      </div>

      {groups.map(({ group, rows: groupRows }) => (
        <section key={group} className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <h2 className={`border-b border-border bg-fill-secondary/60 px-4 py-2.5 ${ledgerHeaderClass}`}>{group}</h2>
          <div className="divide-y divide-border">
            {groupRows.map((row) => {
              const recordGender: RecordGender = row.genders.includes("X") ? "X" : gender
              const side: SideProps = { def: row, gender: recordGender, record: row.records[recordGender] }
              return (
                <div
                  key={`${row.genders.join("")}|${row.event}`}
                  className={`grid items-start gap-x-3 gap-y-1 px-4 py-2.5 text-[15px] ${
                    editing.editing ? "grid-cols-[minmax(0,1fr)_5.5rem_auto]" : "grid-cols-[minmax(0,1fr)_auto]"
                  }`}
                >
                  <RecordSide {...side}>
                    <button
                      type="button"
                      onClick={() => editing.openHistory(row, recordGender)}
                      className="justify-self-start text-left font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {row.label}
                    </button>
                    <RecordTime {...side} className="justify-self-end text-right" />
                    {editing.editing ? (
                      <RecordActions {...side} className="row-span-2 self-center" />
                    ) : null}
                    <RecordNames {...side} align="start" />
                    <RecordYear {...side} className="justify-self-end text-right" />
                  </RecordSide>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

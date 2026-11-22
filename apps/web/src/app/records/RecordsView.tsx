"use client"

import { useState } from "react"
import type { RecordEventDef, RecordGender, TeamRecordsResponse } from "@swimbuzz/shared"
import RecordsTable from "./RecordsTable"
import RecordsList from "./RecordsList"
import RecordHistoryModal from "./RecordHistoryModal"
import ShareRecordsButton from "./ShareRecordsButton"

/**
 * The records page: the club's records sheet (Women's · Event · Men's) on wide screens, one gender
 * at a time on phones. Records come only from imported meet results and the records sheet, so the
 * page is read-only; an event's name opens its history and top 10.
 */
export default function RecordsView({ initial }: { initial: TeamRecordsResponse }) {
  const [history, setHistory] = useState<{ def: RecordEventDef; gender: RecordGender } | null>(null)
  const [gender, setGender] = useState<"F" | "M">("F")
  const openHistory = (def: RecordEventDef, recordGender: RecordGender) => setHistory({ def, gender: recordGender })
  const actions = <ShareRecordsButton rows={initial.rows} />

  return (
    <>
      <RecordsTable rows={initial.rows} action={actions} onOpenHistory={openHistory} />
      <RecordsList
        rows={initial.rows}
        gender={gender}
        onGenderChange={setGender}
        action={actions}
        onOpenHistory={openHistory}
      />

      {history ? (
        <RecordHistoryModal def={history.def} gender={history.gender} onClose={() => setHistory(null)} />
      ) : null}
    </>
  )
}

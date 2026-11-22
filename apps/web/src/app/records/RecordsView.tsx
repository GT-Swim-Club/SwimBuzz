"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  isTopTimesMode,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordsResponse,
  type TopTimesMode,
} from "@swimbuzz/shared"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import RecordsTable from "./RecordsTable"
import RecordsList from "./RecordsList"
import RecordHistoryModal from "./RecordHistoryModal"
import ShareRecordsButton from "./ShareRecordsButton"
import TopTimesBoard, { useAllTopTimes } from "./TopTimesBoard"

type PageView = "records" | "top"

const VIEWS: Array<{ value: PageView; label: string }> = [
  { value: "records", label: "Records" },
  { value: "top", label: "Top 10" },
]

const GENDERS = [
  { value: "F", label: "Women" },
  { value: "M", label: "Men" },
] as const

const MODES: Array<{ value: TopTimesMode; label: string }> = [
  { value: "performers", label: "Performers" },
  { value: "performances", label: "Performances" },
]

type ModalTarget = { def: RecordEventDef; gender: RecordGender }

/**
 * The records page: the club's records sheet (Women's · Event · Men's) on wide screens, one gender
 * at a time on phones — or, under Top 10, every event's top 10 for one gender as cards. Records come
 * only from imported meet results and the records sheet, so the page is read-only; an event's name
 * opens its record history. The view, gender and mode live in the URL (?view=top&gender=M&mode=performances).
 */
export default function RecordsView({ initial }: { initial: TeamRecordsResponse }) {
  const searchParams = useSearchParams()
  const view: PageView = searchParams.get("view") === "top" ? "top" : "records"
  const gender: "F" | "M" = searchParams.get("gender") === "M" ? "M" : "F"
  const modeParam = searchParams.get("mode")
  const mode: TopTimesMode = isTopTimesMode(modeParam) ? modeParam : "performers"
  const [modal, setModal] = useState<ModalTarget | null>(null)
  const topTimes = useAllTopTimes(gender, mode, view === "top")

  /** Defaults drop out of the URL, so the plain records page stays /records. */
  function setParam(key: "view" | "gender" | "mode", value: string, fallback: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === fallback) params.delete(key)
    else params.set(key, value)
    const query = params.toString()
    window.history.replaceState(null, "", query ? `/records?${query}` : "/records")
  }

  const openHistory = (def: RecordEventDef, recordGender: RecordGender) => setModal({ def, gender: recordGender })
  const recordsShare = <ShareRecordsButton rows={initial.rows} />

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle
          selectedIndex={VIEWS.findIndex((v) => v.value === view)}
          fullWidth
          className="basis-full rounded-lg border border-border bg-background sm:basis-auto sm:w-56"
        >
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              aria-pressed={v.value === view}
              onClick={() => setParam("view", v.value, "records")}
              className={segmentedOptionClass(v.value === view)}
            >
              {v.label}
            </button>
          ))}
        </SegmentedToggle>

        {view === "top" ? (
          <>
            <SegmentedToggle
              selectedIndex={GENDERS.findIndex((g) => g.value === gender)}
              fullWidth
              className="min-w-0 flex-1 rounded-lg border border-border bg-background sm:w-44 sm:flex-none"
            >
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  aria-pressed={g.value === gender}
                  onClick={() => setParam("gender", g.value, "F")}
                  className={segmentedOptionClass(g.value === gender)}
                >
                  {g.label}
                </button>
              ))}
            </SegmentedToggle>
            <SegmentedToggle
              selectedIndex={MODES.findIndex((m) => m.value === mode)}
              fullWidth
              className="order-last basis-full rounded-lg border border-border bg-background sm:order-none sm:basis-auto sm:w-72"
            >
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={m.value === mode}
                  onClick={() => setParam("mode", m.value, "performers")}
                  className={segmentedOptionClass(m.value === mode)}
                >
                  {m.label}
                </button>
              ))}
            </SegmentedToggle>
            <div className="ml-auto flex items-center gap-1">
              <ShareRecordsButton rows={initial.rows} topTimes={{ gender, mode, data: topTimes.data }} />
            </div>
          </>
        ) : null}
      </div>

      {view === "top" ? (
        <TopTimesBoard gender={gender} mode={mode} data={topTimes.data} error={topTimes.error} />
      ) : (
        <>
          <RecordsTable rows={initial.rows} action={recordsShare} onOpenHistory={openHistory} />
          <RecordsList
            rows={initial.rows}
            gender={gender}
            onGenderChange={(next) => setParam("gender", next, "F")}
            action={recordsShare}
            onOpenHistory={openHistory}
          />
        </>
      )}

      {modal ? (
        <RecordHistoryModal def={modal.def} gender={modal.gender} onClose={() => setModal(null)} />
      ) : null}
    </>
  )
}

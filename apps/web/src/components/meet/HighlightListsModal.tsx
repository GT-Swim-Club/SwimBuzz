"use client"

import Modal, { ModalFooter } from "@/components/ui/Modal"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import {
  formatOrdinal,
  isDropCounterValue,
  type HighlightList,
  type HighlightListKey,
  type RosterSummaryPdfResult,
  type RosterSummaryPdfRow,
} from "@swimbuzz/shared"

/** A 1st / 2nd / 3rd place's text color (medal tokens), bold; nothing past 3rd. */
export function medalTextClass(place: number | undefined): string | null {
  switch (place) {
    case 1:
      return "text-medal-gold font-semibold"
    case 2:
      return "text-medal-silver font-semibold"
    case 3:
      return "text-medal-bronze font-semibold"
    default:
      return null
  }
}

function deltaClass(delta: string): string {
  return isDropCounterValue(delta) ? "text-success-text" : "text-foreground-tertiary"
}

function Result({ result }: { result: RosterSummaryPdfResult }) {
  if (result.kind === "text") {
    return (
      <span className={`shrink-0 font-mono tabular-nums ${result.strong ? "font-semibold text-foreground" : "text-foreground-secondary"}`}>
        {result.text}
      </span>
    )
  }
  if (result.kind !== "done") return null
  return (
    <span className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
      {result.delta ? <span className={`text-xs ${deltaClass(result.delta)}`}>{result.delta}</span> : null}
      <span className="font-semibold text-foreground">{result.time ?? result.status ?? "—"}</span>
    </span>
  )
}

function ListRow({ row }: { row: RosterSummaryPdfRow }) {
  if (row.subheading) {
    return (
      <li className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-accent first:pt-0">
        {row.label}
      </li>
    )
  }
  const lead =
    row.place != null ? (
      <span className={`w-9 shrink-0 text-xs tabular-nums ${medalTextClass(row.place) ?? "text-foreground-tertiary"}`}>
        {formatOrdinal(row.place)}
      </span>
    ) : row.eventNumber != null ? (
      <span className="w-9 shrink-0 text-xs tabular-nums text-foreground-tertiary">{row.eventNumber}</span>
    ) : null
  return (
    <li className="flex items-start gap-3 py-2 text-sm">
      {lead ? <span className="pt-0.5">{lead}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{row.label}</div>
        {row.meta ? <div className="text-xs text-foreground-secondary">{row.meta}</div> : null}
        {row.legs?.length ? (
          <div className="text-xs text-foreground-secondary">{row.legs.join(" · ")}</div>
        ) : null}
        {row.cuts?.length ? (
          <ul className="mt-0.5 space-y-0.5">
            {row.cuts.map((cut) => (
              <li
                key={cut.event}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 font-mono text-xs tabular-nums"
              >
                <span className="truncate font-sans text-foreground-secondary">{cut.event}</span>
                <span className={deltaClass(cut.delta)}>{cut.delta}</span>
                <span className="text-foreground">
                  {cut.time} <span className="text-foreground-tertiary">/ {cut.cut}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {row.result ? <Result result={row.result} /> : null}
    </li>
  )
}

/**
 * A highlight tile's list — top scorers, top performances, GTSC records or new Nationals cuts — the
 * same rows the highlights export draws, a tab for each list there is.
 */
export default function HighlightListsModal({
  lists,
  list,
  onListChange,
  open,
  onClose,
}: {
  lists: HighlightList[]
  list: HighlightListKey
  onListChange: (list: HighlightListKey) => void
  open: boolean
  onClose: () => void
}) {
  const current = lists.find((l) => l.key === list) ?? lists[0]
  if (!current) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={current.title}
      maxWidth="md"
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill"
          >
            Done
          </button>
        </ModalFooter>
      }
    >
      {lists.length > 1 ? (
        <SegmentedToggle
          selectedIndex={Math.max(0, lists.findIndex((l) => l.key === current.key))}
          fullWidth
          className="mb-3 rounded-lg border border-border-secondary bg-background"
        >
          {lists.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => onListChange(l.key)}
              className={segmentedOptionClass(current.key === l.key) + " text-xs"}
            >
              {l.tab}
            </button>
          ))}
        </SegmentedToggle>
      ) : null}
      <ol className="divide-y divide-border-secondary">
        {current.rows.map((row, i) => (
          <ListRow key={`${i}-${row.label}`} row={row} />
        ))}
      </ol>
    </Modal>
  )
}

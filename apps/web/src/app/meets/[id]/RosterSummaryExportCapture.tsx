"use client"

import { Fragment, useLayoutEffect, useMemo, useRef } from "react"
import {
  highlightTileRows,
  isDropCounterValue,
  relayLegSubSplitsText,
  rosterSummaryRowLegSubSplitsText,
  rosterNameFirstLast,
  rosterNamePreferred,
  rosterSummaryPngColumns,
  type MeetHeaderDetails,
  type StatCounter,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfRow,
  type RosterSummaryPdfSection,
  type RosterSummaryTeamHighlights,
} from "@swimbuzz/shared"
import MeetExportHeader from "@/components/meet/MeetExportHeader"
import TeamPill, { teamPillColumnWidth } from "@/components/meet/TeamPill"
import { relayEyebrowClass } from "./relays/RelayPageHeader"
import { LedgerStatTile } from "@/components/meet/Ledger"
import { AppIcon } from "@/components/ui/AppIcon"
import { podiumPlaceClass } from "@/lib/utils"
import { EventBadge, PODIUM_PILL, SummaryRowResult } from "./SummaryRow"
import { formatOrdinal } from "@/lib/utils"
import { deltaPillClass, formatDelta } from "./SwimDetailModal"

/** Room between a row's name and its heat & lane, so they don't run together at content width. */
const NAME_GAP_PX = 24

/** Medley relay legs in swim order. */
const MEDLEY_STROKES = ["BK", "BR", "FL", "FR"]

/** A round after a label or title in gold caps ("FINALS"), like the round subheadings. */
function CaptureRound({ round }: { round: string }) {
  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
      {round}
    </span>
  )
}

/** `teamWidth`: the team pill column's width, the same for every row (none when no row has a team). */
function CaptureRow({ row, medley, teamWidth }: { row: RosterSummaryPdfRow; medley: boolean; teamWidth?: string }) {
  if (row.subheading) {
    return (
      <li className="pb-1 pt-3 text-[11px] [&+li]:border-t-0 font-semibold uppercase leading-none tracking-[0.12em] text-accent">
        {row.label}
      </li>
    )
  }
  const legs = row.legs ?? []
  // A relay athlete's leg 50s lead the line under the label (the PDF sets them in split columns).
  const meta = [rosterSummaryRowLegSubSplitsText(row), row.meta].filter(Boolean).join(" · ")
  const tags = medley && legs.length === MEDLEY_STROKES.length ? MEDLEY_STROKES : null
  return (
    <li className="flex items-center gap-2.5 border-t border-border-subtle py-2 text-sm leading-[1.3] first:border-t-0">
      {row.eventNumber ? (
        <EventBadge number={row.eventNumber} />
      ) : row.place ? (
        // A fixed column, so labels line up whatever the place.
        <span className="flex w-9 shrink-0 self-start pt-px">
          <span
            className={`inline-flex h-5 items-center rounded-full px-[7px] pb-px text-[11px] font-semibold leading-none ${PODIUM_PILL[row.place] ?? "text-foreground-secondary"}`}
          >
            {formatOrdinal(row.place)}
          </span>
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium tracking-[-0.005em]">
            {rosterNamePreferred(row.label)}
            {/* " (4th)", lighter — as a preferred name's parentheses on the page. */}
            {row.labelNote ? (
              <span className="font-normal text-foreground-secondary"> ({row.labelNote})</span>
            ) : null}
          </span>
          {row.round ? <CaptureRound round={row.round} /> : null}
          {row.sub ? (
            <span className="shrink-0 whitespace-nowrap text-xs text-foreground-tertiary">{row.sub}</span>
          ) : null}
        </span>
        {meta ? <span className="truncate text-xs leading-[1.4] text-foreground-tertiary">{meta}</span> : null}
        {legs.length > 0 ? (
          <span className="grid grid-cols-2 gap-x-3 text-xs leading-[1.4] text-foreground-secondary">
            {legs.map((leg, i) => (
              // The leg line, then any sub-splits under the name (as on the summary's rows).
              <span key={`${i}-${leg}`} className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="w-4 shrink-0 text-[9px] font-semibold tracking-[0.05em] text-foreground-tertiary">
                    {tags?.[i] ?? i + 1}
                  </span>
                  <span className="truncate">{rosterNameFirstLast(rosterNamePreferred(leg))}</span>
                  {row.legSplits?.[i] ? (
                    <span className="shrink-0 tabular-nums text-foreground-tertiary">{row.legSplits[i]}</span>
                  ) : null}
                </span>
                {row.legSubSplits?.[i]?.length ? (
                  <span className="truncate pl-[22px] tabular-nums text-foreground-tertiary">
                    {relayLegSubSplitsText(row.legSubSplits[i])}
                  </span>
                ) : null}
              </span>
            ))}
          </span>
        ) : null}
        {row.cuts?.length ? (
          <span className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-3 text-xs leading-[1.5]">
            {row.cuts.map((cut) => (
              <Fragment key={cut.event}>
                <span className="text-foreground-secondary">{cut.event}</span>
                <span className={`rounded-full px-1.5 font-mono font-medium ${deltaPillClass(cut.delta)}`}>
                  {formatDelta(cut.delta)}
                </span>
                <span className="text-right tabular-nums text-foreground">{cut.time}</span>
                {/* The cut, after the time and quieter. */}
                <span className="text-right tabular-nums text-foreground-tertiary">{cut.cut}</span>
              </Fragment>
            ))}
          </span>
        ) : null}
      </div>
      {teamWidth ? (
        // The team pills in a column of their own, before the heat & lane and result.
        <span className="flex shrink-0 items-center text-[10px]" style={{ width: teamWidth }}>
          {row.team ? <TeamPill team={row.team} tone={row.teamTone} className="" /> : null}
        </span>
      ) : null}
      {row.heatLane || row.startTime ? (
        <span className="flex shrink-0 flex-col items-end text-xs leading-[1.4]" style={{ paddingLeft: NAME_GAP_PX }}>
          {row.heatLane ? <span className="text-foreground-secondary">{row.heatLane}</span> : null}
          {row.startTime ? <span className="text-foreground-tertiary">{row.startTime}</span> : null}
        </span>
      ) : null}
      {row.result?.kind === "text" ? (
        <span
          className={`shrink-0 text-right ${
            row.result.strong ? "text-sm font-semibold tabular-nums text-foreground" : "text-xs text-foreground-secondary"
          }`}
        >
          {row.result.text}
        </span>
      ) : row.result ? (
        <SummaryRowResult result={row.result} compact={false} note={row.resultNote} />
      ) : null}
    </li>
  )
}

function CaptureSection({ section, teamWidth }: { section: RosterSummaryPdfSection; teamWidth?: string }) {
  return (
    <section className="w-full overflow-hidden rounded-xl border border-border-secondary bg-background">
      <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-foreground">
        {section.eventNumber ? (
          <EventBadge number={section.eventNumber} />
        ) : section.icon ? (
          <AppIcon name={section.icon} className="h-[18px] w-[18px] shrink-0 text-accent" />
        ) : null}
        <span>
          {rosterNamePreferred(section.title)}
          {section.team ? <TeamPill team={section.team} tone={section.teamTone} /> : null}
        </span>
        {section.sub ? <CaptureRound round={section.sub} /> : null}
      </div>
      <ul className="border-t border-border-subtle px-4">
        {section.rows.map((row, i) => (
          <CaptureRow
            key={i}
            row={row}
            teamWidth={teamWidth}
            medley={/\bmedley\b/i.test(`${section.title} ${row.label}`)}
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * A highlights export's tiles in rows (the header's eyebrow names them). As wide as the sections
 * below them, never wider.
 */
function CaptureHighlights({ counters }: { counters: StatCounter[] }) {
  const rows = highlightTileRows(counters)
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-2" style={{ width: 0, minWidth: "100%" }}>
      {rows.map(({ counters: row, perRow }, i) => (
        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
          {row.map((counter) => (
            <LedgerStatTile
              key={counter.label}
              label={counter.label}
              value={counter.value}
              sub={counter.hint}
              subBesideLabel={counter.hintBesideLabel}
              detail={counter.detail}
              fit={typeof counter.value === "string" && !/^[-−+]?[\d.:]+$/.test(counter.value) && counter.page !== "teamScores"}
              valueClassName={
                counter.place != null && counter.place <= 3
                  ? podiumPlaceClass(counter.place)
                  : isDropCounterValue(counter.value)
                    ? "text-success-text"
                    : "text-foreground"
              }
            />
          ))}
        </div>
      ))}
    </section>
  )
}

/** Sections in balanced columns, each as wide as the widest column's content. */
function CaptureColumns({ columns }: { columns: RosterSummaryPdfSection[][] }) {
  const gridRef = useRef<HTMLDivElement>(null)
  // One team pill column width for every row, from the longest team named on any of them.
  const teams = columns.flatMap((column) => column.flatMap((section) => section.rows.flatMap((row) => row.team ?? [])))
  const teamWidth = teams.length > 0 ? teamPillColumnWidth(teams) : undefined

  // Columns as wide as their content: lay them out at their natural width, then pin every column
  // to the widest so they line up. Set on the element (not in render) since it depends on layout.
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    grid.style.gridTemplateColumns = `repeat(${columns.length}, max-content)`
    const width = Math.max(...[...grid.children].map((column) => Math.ceil(column.getBoundingClientRect().width)))
    grid.style.gridTemplateColumns = `repeat(${columns.length}, ${width}px)`
  }, [columns])

  return (
    <div ref={gridRef} className="grid w-fit items-start gap-4">
      {columns.map((column, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-4">
          {column.map((section, j) => (
            <CaptureSection key={j} section={section} teamWidth={teamWidth} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** One team's part of a highlights export split by team: its name in gold caps, its tiles, its lists. */
function CaptureTeam({ team }: { team: RosterSummaryTeamHighlights }) {
  const columns = useMemo(() => rosterSummaryPngColumns({ sections: [], highlights: team }), [team])
  return (
    <div className="flex flex-col gap-4">
      <p className={`${relayEyebrowClass} text-sm`}>{team.team}</p>
      <CaptureHighlights counters={team.counters} />
      {columns.length > 0 ? <CaptureColumns columns={columns} /> : null}
    </div>
  )
}

/**
 * Off-screen copy of the roster summary for PNG export, from the same request as the PDF: the meet
 * header, then the sections in balanced columns — at a meet split by team, each team's section in
 * turn under the team scores. Not shown in the page layout.
 */
export default function RosterSummaryExportCapture({
  meetName,
  details,
  iconUrl,
  request,
}: {
  meetName: string
  details: MeetHeaderDetails
  iconUrl: string | null
  request: RosterSummaryPdfRequest
}) {
  const columns = useMemo(() => rosterSummaryPngColumns(request), [request])
  const teams = request.highlights?.teams ?? []

  return (
    <div className="flex w-fit flex-col gap-6 bg-background p-8 text-foreground">
      <MeetExportHeader
        eyebrow={request.heading ?? "Entries"}
        meetName={meetName}
        details={details}
        iconUrl={iconUrl}
      />
      {request.highlights ? <CaptureHighlights counters={request.highlights.counters} /> : null}
      {teams.map((team) => (
        <CaptureTeam key={team.team} team={team} />
      ))}
      {columns.length === 0 ? (
        request.highlights ? null : <p className="text-sm text-foreground-tertiary">No entries match these filters.</p>
      ) : (
        <CaptureColumns columns={columns} />
      )}
    </div>
  )
}

import type { ReactNode } from "react"
import Link from "next/link"
import type { MeetResultEntry, SheetSummary } from "@/lib/meet-sheet-summary"
import {
  compareIndividualEntries,
  dropSeedOnlyAfterResults,
  expandIndividualResultRows,
  groupSheetByAthlete,
  hasSwimResultData,
  inferResultHeatTotals,
  isTimedFinalsEntry,
  mergeMeetResultEntries,
  mergeSheetSummaries,
  relayLeadoffsFromSplits,
  uniqueRelayTeams,
} from "@/lib/meet-sheet-summary"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  relayGenderLabel,
  relayTeamPlace,
  relayTeamTime,
  relayCoachIncompleteNote,
} from "@/lib/relay-results"
import EditMeetSwimButton from "./EditMeetSwimButton"
import RelaySummaryRow from "./RelaySummaryRow"
import SummaryRowLayout from "@/components/SummaryRowLayout"
import { displayMeetResultTags } from "@/lib/swim-tags"
import { formatSeedTimeDelta } from "@/lib/utils"

function formatHeat(entry: SheetSummary["entries"][number]) {
  let heat = entry.heat
  let heatTotal = entry.heatTotal
  if (entry.entryType === "relay_team") {
    const round = effectiveRelayRound(entry)
    if (round === "F") {
      heat = entry.finalHeat ?? entry.heat
      heatTotal = entry.finalHeatTotal ?? entry.heatTotal
    } else if (round === "P") {
      heat = entry.prelimHeat ?? entry.heat
      heatTotal = entry.prelimHeatTotal ?? entry.heatTotal
    } else {
      heat = entry.heat ?? entry.prelimHeat ?? entry.finalHeat
      heatTotal = entry.heatTotal ?? entry.prelimHeatTotal ?? entry.finalHeatTotal
    }
  } else if (entry.resultRound === "F") {
    heat = entry.finalHeat ?? entry.heat
    heatTotal = entry.finalHeatTotal ?? entry.heatTotal
  } else if (entry.resultRound === "P") {
    heat = entry.prelimHeat ?? entry.heat
    heatTotal = entry.prelimHeatTotal ?? entry.heatTotal
  } else {
    heat = entry.heat ?? entry.finalHeat ?? entry.prelimHeat
    heatTotal = entry.heatTotal ?? entry.finalHeatTotal ?? entry.prelimHeatTotal
  }
  if (heat == null || heat < 1) return null
  if (heatTotal != null) return `Heat ${heat} of ${heatTotal}`
  return `Heat ${heat}`
}

function individualLane(entry: SheetSummary["entries"][number]): number | undefined {
  if (entry.resultRound === "F") return entry.finalLane ?? entry.lane
  if (entry.resultRound === "P") return entry.prelimLane ?? entry.lane
  return entry.lane ?? entry.finalLane ?? entry.prelimLane
}

function relayLane(entry: SheetSummary["entries"][number]): number | undefined {
  if (entry.entryType !== "relay_team") return entry.lane
  const round = effectiveRelayRound(entry)
  if (round === "F") return entry.finalLane ?? entry.lane
  if (round === "P") return entry.prelimLane ?? entry.lane
  return entry.lane ?? entry.prelimLane ?? entry.finalLane
}

function formatOrdinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

function finalsPodiumPlace(entry: SheetSummary["entries"][number]): number | undefined {
  if (entry.entryType === "relay_team") {
    const round = effectiveRelayRound(entry)
    if (round === "P") return undefined
    const place = relayTeamPlace(entry)
    return place != null && place >= 1 && place <= 3 ? place : undefined
  }
  if (entry.resultRound === "P") return undefined
  if (entry.finalPlace != null && entry.finalPlace >= 1 && entry.finalPlace <= 3) {
    return entry.finalPlace
  }
  if (entry.resultPlace != null && entry.resultPlace >= 1 && entry.resultPlace <= 3) {
    return entry.resultPlace
  }
  return undefined
}

function podiumRowClass(place: number): string {
  switch (place) {
    case 1:
      return "bg-amber-50 dark:bg-amber-950/30"
    case 2:
      return "bg-slate-100 dark:bg-slate-800/50"
    case 3:
      return "bg-orange-50 dark:bg-orange-950/25"
    default:
      return ""
  }
}

function podiumPlaceClass(place: number): string {
  switch (place) {
    case 1:
      return "text-amber-600 dark:text-amber-400 font-semibold"
    case 2:
      return "text-slate-500 dark:text-slate-300 font-semibold"
    case 3:
      return "text-orange-600 dark:text-orange-400 font-semibold"
    default:
      return "text-gray-400 dark:text-zinc-500"
  }
}

function formatRoundPlace(
  place: number | undefined,
  round?: "prelim" | "final"
) {
  if (place == null || place < 1) return null
  const isFinalsPodium = round === "final" && place >= 1 && place <= 3
  return (
    <span
      className={`text-[11px] font-sans font-normal ${
        isFinalsPodium ? podiumPlaceClass(place) : "text-gray-400 dark:text-zinc-500"
      }`}
    >
      {formatOrdinal(place)}
    </span>
  )
}

function hasResultData(entry: SheetSummary["entries"][number]) {
  return hasSwimResultData(entry)
}

function formatSeedTime(time: string): ReactNode {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[11px] font-sans font-normal text-gray-400 dark:text-zinc-500">
        Seed
      </span>
      <span className="font-mono">{time}</span>
    </span>
  )
}

function formatSeed(entry: SheetSummary["entries"][number]) {
  const hideSeedTime = entry.resultRound === "F"
  const showTime = entry.seedTime && hasResultData(entry) && !hideSeedTime
  if (showTime && entry.seedRank != null) {
    return `Seed ${entry.seedTime} #${entry.seedRank}`
  }
  if (showTime) return `Seed ${entry.seedTime}`
  if (entry.seedRank != null) return `Seed #${entry.seedRank}`
  return null
}

function hasRelayResultData(entry: SheetSummary["entries"][number]) {
  return Boolean(entry.resultTime || entry.finalTime || entry.prelimTime)
}

function formatRelaySeedDetail(entry: SheetSummary["entries"][number]): string | null {
  const hideSeedTime = effectiveRelayRound(entry) === "F"
  const showTime = entry.seedTime && hasRelayResultData(entry) && !hideSeedTime
  if (showTime && entry.seedRank != null) {
    return `Seed ${entry.seedTime} #${entry.seedRank}`
  }
  if (showTime) return `Seed ${entry.seedTime}`
  if (entry.seedRank != null) return `Seed #${entry.seedRank}`
  return null
}

function formatPlacement(entry: SheetSummary["entries"][number]) {
  const parts: string[] = []

  if (entry.entryType === "relay_team") {
    parts.push(`Relay ${displayRelayLetter(entry.relayLetter)}`)
    const heat = formatHeat(entry)
    if (heat) parts.push(heat)
    const lane = relayLane(entry)
    if (lane != null) parts.push(`Lane ${lane}`)
    const seed = formatRelaySeedDetail(entry)
    if (seed) parts.push(seed)
    return parts.join(" · ")
  }

  if (entry.isRelayLeadoff) {
    parts.push("Relay leadoff")
    if (entry.relayLeadoffSource) parts.push(entry.relayLeadoffSource)
  }
  const heat = formatHeat(entry)
  if (heat) parts.push(heat)
  const lane = individualLane(entry)
  if (lane != null) parts.push(`Lane ${lane}`)
  const seed = formatSeed(entry)
  if (seed) parts.push(seed)
  return parts.join(" · ")
}

function formatSeedDeltaEl(
  seedTime: string | undefined,
  resultTime: string
): ReactNode {
  if (!seedTime) return null
  const delta = formatSeedTimeDelta(seedTime, resultTime)
  if (!delta) return null
  const isDrop = delta.startsWith("-")
  return (
    <span
      className={`text-[11px] font-mono tabular-nums ${
        isDrop
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {delta}
    </span>
  )
}

function formatRoundTime(
  label: string,
  time: string,
  place?: number,
  seedTime?: string
) {
  const round =
    label === "Finals" || label === "Timed Finals"
      ? "final"
      : label === "Prelims"
        ? "prelim"
        : undefined
  const placeEl = formatRoundPlace(place, round)
  const deltaEl = formatSeedDeltaEl(seedTime, time)
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[11px] font-sans font-normal text-gray-400 dark:text-zinc-500">
        {label}
      </span>
      {deltaEl}
      <span className="font-mono">{time}</span>
      {placeEl ? (
        <>
          <span className="text-gray-300 dark:text-zinc-600">·</span>
          {placeEl}
        </>
      ) : null}
    </span>
  )
}

function formatTimedResult(time: string, place?: number, seedTime?: string) {
  return formatRoundTime("Timed Finals", time, place, seedTime)
}

function formatRoundStatus(label: string, status: string) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[11px] font-sans font-normal text-gray-400 dark:text-zinc-500">
        {label}
      </span>
      <span className="font-mono text-amber-700 dark:text-amber-400">{status}</span>
    </span>
  )
}

function formatTimedStatus(status: string) {
  return formatRoundStatus("Timed Finals", status)
}

function formatRoundResult(
  label: string,
  time?: string,
  status?: string,
  place?: number,
  seedTime?: string
): ReactNode | null {
  if (time) return formatRoundTime(label, time, place, seedTime)
  if (status) return formatRoundStatus(label, status)
  return null
}

function formatRelayTeamTime(entry: SheetSummary["entries"][number]): ReactNode {
  const round = effectiveRelayRound(entry)
  const time = relayTeamTime(entry)
  const place = relayTeamPlace(entry)
  const seed = entry.seedTime

  if (round === "P" && time) return formatRoundTime("Prelims", time, place, seed)
  if (round === "F" && time) return formatRoundTime("Finals", time, place, seed)
  if (time) {
    return isTimedFinalsEntry(entry)
      ? formatTimedResult(time, place, seed)
      : formatRoundTime("Finals", time, place, seed)
  }
  if (entry.seedTime) return formatSeedTime(entry.seedTime)
  if (entry.timeStatus) return entry.timeStatus
  return "—"
}

function formatIndividualResult(
  entry: SheetSummary["entries"][number],
  allEntries?: SummaryEntry[]
): ReactNode {
  const seed = entry.seedTime
  const timedOpts = allEntries ? { allEntries } : undefined

  if (entry.resultRound === "P") {
    return (
      formatRoundResult(
        "Prelims",
        entry.prelimTime,
        entry.prelimStatus,
        entry.prelimPlace,
        seed
      ) ??
      (entry.seedTime ? formatSeedTime(entry.seedTime) : "—")
    )
  }

  if (entry.resultRound === "F") {
    if (isTimedFinalsEntry(entry, timedOpts)) {
      const time = entry.finalTime ?? entry.resultTime
      const status =
        entry.finalStatus === "NS" ? undefined : entry.finalStatus ?? entry.resultStatus
      return (
        formatRoundResult(
          "Timed Finals",
          time,
          status,
          entry.finalPlace ?? entry.resultPlace,
          seed
        ) ?? "—"
      )
    }
    const finalStatus =
      entry.finalStatus === "NS" ? undefined : entry.finalStatus
    return (
      formatRoundResult(
        "Finals",
        entry.finalTime,
        finalStatus,
        entry.finalPlace,
        seed
      ) ?? "—"
    )
  }

  const prelim = formatRoundResult(
    "Prelims",
    entry.prelimTime,
    entry.prelimStatus,
    entry.prelimPlace,
    seed
  )
  // SwimPhone marks non-advancers as NS in the finals column — omit that.
  const finalStatus =
    entry.finalStatus === "NS" ? undefined : entry.finalStatus
  const final = formatRoundResult(
    "Finals",
    entry.finalTime,
    finalStatus,
    entry.finalPlace,
    seed
  )
  if (prelim && final) {
    return (
      <span className="inline-flex items-baseline gap-2">
        {prelim}
        <span className="text-gray-300 dark:text-zinc-600">·</span>
        {final}
      </span>
    )
  }
  if (final) {
    return isTimedFinalsEntry(entry, timedOpts)
      ? formatTimedResult(entry.finalTime!, entry.finalPlace, seed)
      : final
  }
  if (prelim) return prelim
  if (entry.resultTime) {
    return isTimedFinalsEntry(entry, timedOpts)
      ? formatTimedResult(entry.resultTime, entry.resultPlace, seed)
      : formatRoundTime("Finals", entry.resultTime, entry.resultPlace, seed)
  }
  if (entry.resultStatus) {
    return isTimedFinalsEntry(entry, timedOpts)
      ? formatTimedStatus(entry.resultStatus)
      : formatRoundStatus("Finals", entry.resultStatus)
  }
  if (entry.seedTime) return formatSeedTime(entry.seedTime)
  if (entry.timeStatus) return entry.timeStatus
  return "—"
}

function formatTime(
  entry: SheetSummary["entries"][number],
  allEntries?: SummaryEntry[]
): ReactNode {
  if (entry.isRelayLeadoff && entry.relayLeadoffTime) {
    return formatRoundTime(
      "Leadoff",
      entry.relayLeadoffTime,
      entry.resultPlace,
      entry.seedTime
    )
  }
  if (entry.entryType === "relay_team") {
    return formatRelayTeamTime(entry)
  }
  return formatIndividualResult(entry, allEntries)
}

type SummaryEntry = SheetSummary["entries"][number]

function entryRowKey(
  entry: SummaryEntry,
  i: number,
  athleteGenders?: Map<string, "M" | "F">
) {
  const gender = effectiveRelayGender(entry, athleteGenders)
  return `${entry.event}-${entry.eventNumber}-${entry.entryType}-${gender}-${entry.relayLetter ?? ""}-${entry.relayRound ?? ""}-${entry.resultRound ?? ""}-${entry.relayLeadoffSource ?? ""}-${entry.relayLeadoffRound ?? ""}-${entry.isRelayLeadoff ? "leadoff" : ""}-${i}`
}

function formatRelayEventLabel(
  entry: SummaryEntry,
  athleteGenders?: Map<string, "M" | "F">
) {
  const gender = effectiveRelayGender(entry, athleteGenders)
  const prefix = relayGenderLabel(gender)
  return prefix ? `${prefix} ${entry.event}` : entry.event
}

function SummaryEntryRow({
  entry,
  canEdit,
  meetId,
  meetName,
  athletes,
  athleteGenders,
  eventLabel,
  allEntries,
}: {
  entry: SummaryEntry
  canEdit?: boolean
  meetId?: string
  meetName?: string
  athletes?: Array<{ id: string; name: string }>
  athleteGenders?: Map<string, "M" | "F">
  eventLabel?: string
  allEntries?: SummaryEntry[]
}) {
  const placement = formatPlacement(entry)
  const details = [
    placement,
    entry.startTime,
    entry.entryType !== "relay_team"
      ? displayMeetResultTags(entry.resultTags ?? "") ?? null
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const label =
    eventLabel ??
    (entry.entryType === "relay_team"
      ? formatRelayEventLabel(entry, athleteGenders)
      : entry.event)

  const editButton =
    canEdit && meetId && athletes ? (
      entry.manual &&
      !entry.isRelayLeadoff &&
      entry.swimId &&
      entry.course &&
      entry.date &&
      entry.timeMs != null ? (
        <EditMeetSwimButton
          swimId={entry.swimId}
          meetId={meetId}
          meetName={meetName ?? ""}
          athletes={athletes}
          athleteId={entry.athleteId}
          event={entry.event}
          course={entry.course}
          date={entry.date}
          timeMs={entry.timeMs}
        />
      ) : null
    ) : null

  if (entry.entryType === "relay_team") {
    const round = effectiveRelayRound(entry)
    const gender = effectiveRelayGender(entry, athleteGenders)
    const roundSuffix =
      round === "P"
        ? " · Prelims"
        : round === "F"
          ? " · Finals"
          : hasRelayResultData(entry)
            ? isTimedFinalsEntry(entry)
              ? " · Timed Finals"
              : " · Finals"
            : ""
    const genderSuffix =
      gender === "F" ? " · Women's" : gender === "M" ? " · Men's" : gender === "X" ? " · Mixed" : ""
    const detailTitle = `${label} ${displayRelayLetter(entry.relayLetter)}${genderSuffix}${roundSuffix}`
    const podium = finalsPodiumPlace(entry)
    const coachNote = canEdit ? relayCoachIncompleteNote(entry) ?? undefined : undefined

    return (
      <RelaySummaryRow
        entry={entry}
        label={label}
        details={details || undefined}
        coachNote={coachNote}
        timeDisplay={formatTime(entry, allEntries)}
        detailTitle={detailTitle}
        rowClassName={podium ? podiumRowClass(podium) : undefined}
        canEdit={canEdit}
        meetId={meetId}
        athletes={athletes}
      />
    )
  }

  const podiumPlace = finalsPodiumPlace(entry)

  return (
    <SummaryRowLayout
      className={podiumPlace ? podiumRowClass(podiumPlace) : ""}
      label={label}
      details={details || undefined}
      right={
        <>
          {formatTime(entry, allEntries)}
          {editButton}
        </>
      }
    />
  )
}

export default function MeetSheetSummarySection({
  psychSummary,
  heatSummary,
  entriesSummary,
  results,
  relayResults,
  headerAction,
  meetId,
  meetName,
  athletes = [],
  canEdit = false,
}: {
  psychSummary?: SheetSummary | null
  heatSummary?: SheetSummary | null
  entriesSummary?: SheetSummary | null
  results?: MeetResultEntry[] | null
  relayResults?: SheetSummary["entries"] | null
  headerAction?: ReactNode
  meetId?: string
  meetName?: string
  athletes?: Array<{ id: string; name: string; gender?: "M" | "F" }>
  canEdit?: boolean
}) {
  const athleteGenders = new Map(
    athletes
      .filter((a): a is typeof a & { gender: "M" | "F" } => a.gender === "M" || a.gender === "F")
      .map((a) => [a.id, a.gender])
  )

  const leadoffResults = mergeMeetResultEntries(
    results ?? [],
    relayLeadoffsFromSplits(relayResults)
  )

  const summary = mergeSheetSummaries(
    psychSummary,
    heatSummary,
    leadoffResults,
    relayResults,
    entriesSummary
  )
  const relays = summary ? uniqueRelayTeams(summary.entries, athleteGenders) : []
  const womenRelays = relays.filter(
    (e) => effectiveRelayGender(e, athleteGenders) === "F"
  )
  const menRelays = relays.filter(
    (e) => effectiveRelayGender(e, athleteGenders) === "M"
  )
  const mixedRelays = relays.filter(
    (e) => effectiveRelayGender(e, athleteGenders) === "X"
  )
  const otherRelays = relays.filter(
    (e) => effectiveRelayGender(e, athleteGenders) === ""
  )
  const hasImportedResults = Boolean(
    (results?.length ?? 0) > 0 || (relayResults?.length ?? 0) > 0
  )
  const displayEntries = summary
    ? dropSeedOnlyAfterResults(
        expandIndividualResultRows(inferResultHeatTotals(summary.entries)),
        hasImportedResults
      )
    : []
  const grouped = summary ? groupSheetByAthlete(displayEntries) : []
  const hasContent = relays.length > 0 || grouped.length > 0

  function renderRelayGroup(title: string, entries: SummaryEntry[]) {
    if (entries.length === 0) return null
    return (
      <>
        <li className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-950/50">
          {title}
        </li>
        {entries.map((entry, i) => (
          <SummaryEntryRow
            key={entryRowKey(entry, i, athleteGenders)}
            entry={entry}
            canEdit={canEdit}
            meetId={meetId}
            meetName={meetName}
            athletes={athletes}
            athleteGenders={athleteGenders}
            eventLabel={entry.event}
            allEntries={displayEntries}
          />
        ))}
      </>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
          Roster Summary
        </h2>
        {headerAction}
      </div>
      {!hasContent ? (
        <div className="border rounded-xl px-4 py-10 text-center text-sm text-gray-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
          No entries yet.
        </div>
      ) : (
      <div className="space-y-3">
        {relays.length > 0 ? (
          <div className="border rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
            <div className="px-4 py-2.5 text-sm font-medium border-b dark:border-zinc-800 text-gray-700 dark:text-zinc-300">
              Relays
            </div>
            <ul className="divide-y dark:divide-zinc-800">
              {renderRelayGroup("Women's", womenRelays)}
              {renderRelayGroup("Men's", menRelays)}
              {renderRelayGroup("Mixed", mixedRelays)}
              {otherRelays.map((entry, i) => (
                <SummaryEntryRow
                  key={entryRowKey(entry, i, athleteGenders)}
                  entry={entry}
                  canEdit={canEdit}
                  meetId={meetId}
                  meetName={meetName}
                  athletes={athletes}
                  athleteGenders={athleteGenders}
                  allEntries={displayEntries}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {grouped.map((athlete) => {
          const events = [...athlete.entries].sort(compareIndividualEntries)
          return (
            <div
              key={athlete.name}
              className="border rounded-xl overflow-hidden bg-white dark:bg-zinc-900"
            >
              <Link
                href={`/athletes/${athlete.entries[0]?.athleteId}`}
                className="block px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors border-b dark:border-zinc-800"
              >
                {athlete.name}
              </Link>
              <ul className="divide-y dark:divide-zinc-800">
                {events.map((entry, i) => (
                  <SummaryEntryRow
                    key={entryRowKey(entry, i, athleteGenders)}
                    entry={entry}
                    canEdit={canEdit}
                    meetId={meetId}
                    meetName={meetName}
                    athletes={athletes}
                    athleteGenders={athleteGenders}
                    allEntries={displayEntries}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      )}
    </section>
  )
}

"use client"

import type { ReactNode } from "react"
import { useState, Fragment } from "react"
import Link from "next/link"
import type { MeetResultEntry, SheetSummary } from "@/lib/meet-sheet-summary"
import {
  compareIndividualEntries,
  dropSeedOnlyAfterResults,
  entryDisplaySplits,
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
import { compareRelayEvents, compareSwimEvents, normalizeEventName } from "@/lib/swim-parse"
import {
  eventNumberForGender,
  type MeetSignupEventOption,
} from "@/lib/meet-signup"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  relayGenderLabel,
  relayTeamPlace,
  relayTeamTime,
  relayCoachIncompleteNote,
} from "@/lib/relay-results"
import type { SheetEntry } from "@/lib/meet-sheet-summary"
import EditMeetSwimButton from "./EditMeetSwimButton"
import EditSheetSeedButton from "./EditSheetSeedButton"
import IndividualSummaryRow from "./IndividualSummaryRow"
import RelaySummaryRow from "./RelaySummaryRow"
import SummaryRowLayout from "@/components/SummaryRowLayout"
import { displayMeetResultTags } from "@/lib/swim-tags"
import { formatDisplayTime, formatSeedTimeDelta, podiumPlaceClass, parseTime } from "@/lib/utils"

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

function formatRoundPlace(
  place: number | undefined,
  round?: "prelim" | "final"
) {
  if (place == null || place < 1) return null
  const isFinalsPodium = round === "final" && place >= 1 && place <= 3
  return (
    <span
      className={`text-[11px] font-sans font-normal ${
        isFinalsPodium ? podiumPlaceClass(place) : "text-foreground-tertiary dark:text-foreground-tertiary"
      }`}
    >
      {formatOrdinal(place)}
    </span>
  )
}

function hasResultData(entry: SheetSummary["entries"][number]) {
  return hasSwimResultData(entry)
}

function formatSeedTime(time: string, rank?: number): ReactNode {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[11px] font-sans font-normal text-foreground-tertiary dark:text-foreground-tertiary">
        Seed
      </span>
      <span className="font-mono">{formatDisplayTime(time)}</span>
      {rank != null ? (
        <>
          <span className="text-gray-300 dark:text-zinc-600">·</span>
          <span className="text-[11px] font-sans font-normal text-foreground-tertiary dark:text-foreground-tertiary">
            #{rank}
          </span>
        </>
      ) : null}
    </span>
  )
}

function formatSeed(entry: SheetSummary["entries"][number]) {
  const hideSeedTime = entry.resultRound === "F"
  const seedValue = entry.seedTime || entry.timeStatus
  const showTime = seedValue && !hideSeedTime
  if (showTime && entry.seedRank != null) {
    return `Seed ${formatDisplayTime(seedValue!)} #${entry.seedRank}`
  }
  if (showTime) return `Seed ${formatDisplayTime(seedValue!)}`
  if (entry.seedRank != null) return `Seed #${entry.seedRank}`
  return null
}

function hasRelayResultData(entry: SheetSummary["entries"][number]) {
  return Boolean(entry.resultTime || entry.finalTime || entry.prelimTime)
}

function formatRelaySeedDetail(entry: SheetSummary["entries"][number]): string | null {
  const hideSeedTime = effectiveRelayRound(entry) === "F"
  const seedValue = entry.seedTime || entry.timeStatus
  const showTime = seedValue && !hideSeedTime
  if (showTime && entry.seedRank != null) {
    return `Seed ${formatDisplayTime(seedValue!)} #${entry.seedRank}`
  }
  if (showTime) return `Seed ${formatDisplayTime(seedValue!)}`
  if (entry.seedRank != null) return `Seed #${entry.seedRank}`
  return null
}

function formatPlacement(entry: SheetSummary["entries"][number], skipRelayLabel = false, hasResults: boolean) {
  const parts: string[] = []

  if (entry.entryType === "relay_team") {
    if (!skipRelayLabel) {
      parts.push(`Relay ${displayRelayLetter(entry.relayLetter)}`)
    }
    const heat = formatHeat(entry)
    if (heat) parts.push(heat)
    const lane = relayLane(entry)
    if (lane != null) parts.push(`Lane ${lane}`)
    const seed = hasResults ? formatRelaySeedDetail(entry) : null
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
  const seed = hasResults ? formatSeed(entry) : null
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
          : "text-error dark:text-error"
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
      <span className="text-[11px] font-sans font-normal text-foreground-tertiary dark:text-foreground-tertiary">
        {label}
      </span>
      {deltaEl}
      <span className="font-mono">{formatDisplayTime(time)}</span>
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
      <span className="text-[11px] font-sans font-normal text-foreground-tertiary dark:text-foreground-tertiary">
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
  const seed = entry.seedTime || (entry.timeStatus === "NT" ? "NT" : undefined)

  if (round === "P" && time) return formatRoundTime("Prelims", time, place, seed)
  if (round === "F" && time) return formatRoundTime("Finals", time, place, seed)
  if (time) {
    return isTimedFinalsEntry(entry)
      ? formatTimedResult(time, place, seed)
      : formatRoundTime("Finals", time, place, seed)
  }
  if (seed) return formatSeedTime(seed, entry.seedRank)
  if (entry.timeStatus) return entry.timeStatus
  return "—"
}

function formatIndividualResult(
  entry: SheetSummary["entries"][number],
  allEntries?: SummaryEntry[]
): ReactNode {
  const seed = entry.seedTime || (entry.timeStatus === "NT" ? "NT" : undefined)
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
      (seed ? formatSeedTime(seed, entry.seedRank) : "—")
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
  if (seed) return formatSeedTime(seed, entry.seedRank)
  if (entry.timeStatus) return entry.timeStatus
  return "—"
}

function getRawTime(entry: SheetEntry): string | undefined {
  if (entry.isRelayLeadoff && entry.relayLeadoffTime) return entry.relayLeadoffTime
  if (entry.entryType === "relay_team") return relayTeamTime(entry) ?? undefined
  return entry.resultTime ?? entry.finalTime ?? entry.prelimTime ?? undefined
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
  const athleteKey = entry.entryType !== "relay_team" ? `-${entry.athleteId}` : ""
  return `${entry.event}-${entry.eventNumber}-${entry.entryType}-${gender}-${entry.relayLetter ?? ""}-${entry.relayRound ?? ""}-${entry.resultRound ?? ""}-${entry.relayLeadoffSource ?? ""}-${entry.relayLeadoffRound ?? ""}-${entry.isRelayLeadoff ? "leadoff" : ""}${athleteKey}-${i}`
}

function formatRelayEventLabel(
  entry: SummaryEntry,
  athleteGenders?: Map<string, "M" | "F">
) {
  const gender = effectiveRelayGender(entry, athleteGenders)
  const prefix = relayGenderLabel(gender)
  return prefix ? `${prefix} ${entry.event}` : entry.event
}

function withEventNumber(eventNumber: number | null | undefined, label: string): string {
  return eventNumber != null && eventNumber > 0 ? `#${eventNumber} ${label}` : label
}

function resolveDisplayEventNumber(
  entry: SummaryEntry,
  athleteGenders?: Map<string, "M" | "F">,
  eventOptions?: MeetSignupEventOption[]
): number {
  if (entry.eventNumber > 0) return entry.eventNumber
  if (!eventOptions?.length) return 0
  const key = normalizeEventName(entry.event)
  const opt = eventOptions.find((o) => normalizeEventName(o.event) === key)
  if (!opt) return 0
  const gender =
    entry.entryType === "relay_team"
      ? effectiveRelayGender(entry, athleteGenders)
      : athleteGenders?.get(entry.athleteId)
  if (gender === "F" || gender === "M") {
    return eventNumberForGender(opt, gender) ?? 0
  }
  return opt.women ?? opt.men ?? 0
}

function initialsFromName(name?: string | null) {
  if (name?.includes(",")) {
    const [lastName, firstName] = name.split(',').map(s => s.trim())
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase()
    }
  }
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return "?"
}

function getEntryPlace(entry: SheetEntry): number | undefined {
  return entry.resultPlace ?? entry.finalPlace ?? entry.prelimPlace;
}

function compareByPlace(a: SummaryEntry, b: SummaryEntry, hasResults: boolean): number {
  const placeA = getEntryPlace(a);
  const placeB = getEntryPlace(b);

  if (hasResults) {
    const pA = placeA ?? Infinity;
    const pB = placeB ?? Infinity;
    if (pA !== pB) return pA - pB;
  } else {
    // 1. Sort by seedTime fastest to slowest
    const isNt = (time?: string) => !time || /^nt$/i.test(time.trim());
    const isNtA = isNt(a.seedTime);
    const isNtB = isNt(b.seedTime);

    if (isNtA && !isNtB) return 1;
    if (!isNtA && isNtB) return -1;
    if (!isNtA && !isNtB) {
      const msA = parseTime(a.seedTime!);
      const msB = parseTime(b.seedTime!);
      if (Number.isFinite(msA) && Number.isFinite(msB) && msA !== msB) {
        return msA - msB;
      }
    }

    // 2. Fallback to seedRank if seedTime is the same
    const rA = a.seedRank != null ? Number(a.seedRank) : Infinity;
    const rB = b.seedRank != null ? Number(b.seedRank) : Infinity;
    if (rA !== rB) return rA - rB;
  }

  return compareIndividualEntries(a, b);
}

function AthleteAvatar({ image, name }: { image?: string | null; name: string }) {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-secondary bg-primary/10 text-[10px] font-medium text-primary">
      {image ? (
        <img src={image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span>{initialsFromName(name)}</span>
      )}
    </div>
  )
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
  individualEventOptions,
  editableSeedKeys = new Set<string>(),
  eventNumberOptions,
  showAthleteInfo = false,
  skipRelayLabel = false,
  forceEventNumber = false,
}: {
  entry: SummaryEntry
  canEdit?: boolean
  meetId?: string
  meetName?: string
  athletes?: Array<{ id: string; name: string; image?: string | null }>
  athleteGenders?: Map<string, "M" | "F">
  eventLabel?: string
  showAthleteInfo?: boolean
  skipRelayLabel?: boolean
  forceEventNumber?: boolean
  allEntries?: SummaryEntry[]
  individualEventOptions?: string[]
  editableSeedKeys?: Set<string>
  eventNumberOptions?: MeetSignupEventOption[]
}) {
  const hasResults = entry.entryType === "relay_team" ? hasRelayResultData(entry) : hasSwimResultData(entry)
  const placement = formatPlacement(entry, skipRelayLabel, hasResults)
  const details = [
    placement,
    entry.startTime,
    entry.entryType !== "relay_team"
      ? displayMeetResultTags(entry.resultTags ?? "") ?? null
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
  
  const athleteAvatar = showAthleteInfo && entry.entryType !== "relay_team" ? (
      <AthleteAvatar image={athletes?.find(a => a.id === entry.athleteId)?.image} name={entry.athleteName} />
  ) : null;

  const eventName = eventLabel ??
      (entry.entryType === "relay_team"
        ? formatRelayEventLabel(entry, athleteGenders)
        : entry.event);

  const eventWithNum = withEventNumber(
    (entry.entryType === "relay_team" && eventLabel && !forceEventNumber) ? null : resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions),
    eventName
  );

  const label = (
    <div className="flex items-center gap-2">
      {athleteAvatar}
      {showAthleteInfo && entry.entryType !== "relay_team" ? (
          <span className={`${showAthleteInfo ? "font-normal" : "font-medium"} text-foreground group-hover:text-primary transition-colors`}>{entry.athleteName}</span>
      ) : null}
      {(!showAthleteInfo || entry.entryType === "relay_team") && eventWithNum}
    </div>
  )

  // Swim info for modal
  const swimInfo = {
    seedTime: entry.seedTime ?? entry.timeStatus ?? undefined,
    rank: entry.seedRank,
    resultPlace: entry.resultPlace ?? entry.finalPlace ?? entry.prelimPlace,
    heat: formatHeat(entry)?.replace("Heat ", ""),
    lane: entry.entryType === "relay_team" ? relayLane(entry) : individualLane(entry),
    time: typeof formatTime(entry, allEntries) === "string" ? (formatTime(entry, allEntries) as string) : undefined,
    rawTime: getRawTime(entry)
  }

  const editButton =
    canEdit && meetId ? (
      entry.manual &&
      !entry.isRelayLeadoff &&
      entry.swimId &&
      entry.course &&
      entry.date &&
      entry.timeMs != null &&
      athletes ? (
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
      ) : !entry.isRelayLeadoff &&
        !entry.swimId &&
        entry.entryType !== "relay_team" &&
        (entry.manual === true ||
          editableSeedKeys.has(
            `${entry.athleteId}|${normalizeEventName(entry.event)}`
          )) ? (
        <EditSheetSeedButton
          meetId={meetId}
          athleteId={entry.athleteId}
          athleteName={entry.athleteName}
          event={entry.event}
          seedTime={entry.seedTime}
          timeStatus={entry.timeStatus}
          eventOptions={individualEventOptions}
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
    const genderLabel = gender === "F" ? "Women's" : gender === "M" ? "Men's" : gender === "X" ? "Mixed" : "";
    const eventNum = entry.eventNumber > 0 ? `#${entry.eventNumber} ` : ""
    const detailTitle = `${eventNum}${genderLabel} ${entry.event} ${displayRelayLetter(entry.relayLetter)}${roundSuffix}`
    const podium = finalsPodiumPlace(entry)
    const coachNote = canEdit ? relayCoachIncompleteNote(entry) ?? undefined : undefined
    const rowId = entry.swimId ? `swim-${entry.swimId}` : undefined

    return (
      <RelaySummaryRow
        id={rowId}
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
        swimInfo={swimInfo}
      />
    )
  }

  const podiumPlace = finalsPodiumPlace(entry)
  const splits = entryDisplaySplits(entry)
  const roundSuffix =
    entry.resultRound === "P"
      ? " · Prelims"
      : entry.resultRound === "F"
        ? " · Finals"
        : hasSwimResultData(entry)
          ? isTimedFinalsEntry(entry, { allEntries })
            ? " · Timed Finals"
            : ""
          : ""
  const detailTitle = `${withEventNumber(
    resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions),
    eventName
  )}${roundSuffix}`
  const timeDisplay = formatTime(entry, allEntries)
  const rowId = entry.swimId ? `swim-${entry.swimId}` : undefined

  return (
      <IndividualSummaryRow
        id={rowId}
        label={label}
        athleteName={entry.athleteName}
        athleteId={entry.athleteId}
        details={details || undefined}
        timeDisplay={timeDisplay}
        detailTitle={detailTitle}
        rowClassName={podiumPlace ? podiumRowClass(podiumPlace) : undefined}
        splits={splits}
        editButton={editButton}
        swimInfo={swimInfo}
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
  viewerAthleteId = null,
  individualEventOptions = [],
  editableSeedKeys = [],
  eventNumberOptions = [],
}: {
  psychSummary?: SheetSummary | null
  heatSummary?: SheetSummary | null
  entriesSummary?: SheetSummary | null
  results?: MeetResultEntry[] | null
  relayResults?: SheetSummary["entries"] | null
  headerAction?: ReactNode
  meetId?: string
  meetName?: string
  athletes?: Array<{ id: string; name: string; gender?: "M" | "F"; image?: string | null }>
  canEdit?: boolean
  /** Linked roster athlete for the signed-in user — their rows pin to the top. */
  viewerAthleteId?: string | null
  /** Individual event names from the meet packet (for editing sign-up seeds). */
  individualEventOptions?: string[]
  /** `athleteId|event` keys for sign-up/coach seeds that coaches can edit/delete. */
  editableSeedKeys?: string[]
  /** Meet packet event options used to fill missing event numbers. */
  eventNumberOptions?: MeetSignupEventOption[]
}) {
  const editableSeedKeySet = new Set(editableSeedKeys)
  const [searchQuery, setSearchQuery] = useState("");
  const [viewByEvent, setViewByEvent] = useState(false);
  
  const athleteGenders = new Map(
    athletes
      .filter((a): a is typeof a & { gender: "M" | "F" } => a.gender === "M" || a.gender === "F")
      .map((a) => [a.id, a.gender])
  )
  const athleteNames = new Map(athletes.map((a) => [a.id, a.name]))

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
    (results?.length ?? 0) > 0 ||
      (relayResults ?? []).some(
        (e) =>
          Boolean(
            e.resultTime ||
              e.finalTime ||
              e.prelimTime ||
              e.resultStatus ||
              e.prelimStatus ||
              e.finalStatus
          )
      )
  )
  const displayEntries = summary
    ? dropSeedOnlyAfterResults(
        expandIndividualResultRows(inferResultHeatTotals(summary.entries)),
        hasImportedResults,
        editableSeedKeySet
      )
    : []
  const grouped = summary ? groupSheetByAthlete(displayEntries, athleteNames) : []

  const myIndividualEntries = viewerAthleteId
    ? displayEntries
        .filter(
          (e) =>
            e.athleteId === viewerAthleteId &&
            (e.entryType === "individual" || e.isRelayLeadoff)
        )
        .sort(compareIndividualEntries)
    : []
  const myRelays = viewerAthleteId
    ? relays
        .filter((e) =>
          e.relaySwimmers?.some((s) => s.athleteId === viewerAthleteId)
        )
        .sort((a, b) => compareRelayEvents(a.event, b.event))
    : []
  const myEntries = [...myIndividualEntries, ...myRelays]
  const otherGrouped = viewerAthleteId
    ? grouped.filter((a) => a.entries[0]?.athleteId !== viewerAthleteId)
    : grouped

  const filteredMyEntries = myEntries.filter(
    (e) => !searchQuery || e.athleteName.toLowerCase().includes(searchQuery.toLowerCase()) || e.event.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredRelays = relays.filter(
    (e) => !searchQuery || e.relaySwimmers?.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())) || e.event.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredOtherGrouped = otherGrouped.filter(
    (a) => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.entries.some(e => e.event.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // For the "by event" view: use the de-duped relay list (same as the by-athlete relay section)
  // so that seed rows from the heat sheet don't appear as duplicates alongside result rows.
  const deduplicatedByEventEntries: SummaryEntry[] = [
    ...displayEntries.filter((e) => e.entryType !== "relay_team"),
    ...relays,
  ]

  const rawGroupedEvents = deduplicatedByEventEntries
    .reduce((acc, entry) => {
      const gender = entry.entryType === "relay_team"
        ? (effectiveRelayGender(entry, athleteGenders) || entry.gender || "U")
        : (entry.gender || athleteGenders.get(entry.athleteId) || "U");
      const eventNumber = resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions);
      const genderLabel = gender === "F" ? "Women's" : gender === "M" ? "Men's" : gender === "X" ? "Mixed" : "";
      
      // Use the eventNumber, gender, and event name for unique grouping
      const header = `${eventNumber > 0 ? `#${eventNumber} ` : ""}${genderLabel} ${entry.event}`;
      
      if (!acc.has(header)) {
          acc.set(header, {
              header,
              eventNumber,
              entries: []
          });
      }
      acc.get(header)!.entries.push(entry);
      return acc
    }, new Map<string, { header: string, eventNumber: number, entries: SummaryEntry[] }>())

  const groupedEvents = new Map([...rawGroupedEvents.entries()].filter(([header, data]) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return header.toLowerCase().includes(q) || data.entries.some(e =>
          (e.athleteName ?? "").toLowerCase().includes(q) ||
          e.relaySwimmers?.some(s => s.name.toLowerCase().includes(q))
      );
  }))

  const sortedEventHeaders = [...groupedEvents.values()].sort((a, b) => {
    // Sort numerically by eventNumber, then alphabetically by header
    if (a.eventNumber !== b.eventNumber) {
        if (a.eventNumber === 0) return 1
        if (b.eventNumber === 0) return -1
        return a.eventNumber - b.eventNumber
    }
    return a.header.localeCompare(b.header)
  })

  // Separate into odd/even if needed (e.g., standard meet structure)
  // Actually, event numbers can be anything, so we just group by parity if it's generally applicable
  // For this request, I will just order by event number.
  
  const hasContent = relays.length > 0 || grouped.length > 0

  function renderRelayGroup(title: string, entries: SummaryEntry[], prefix: string) {
    if (entries.length === 0) return null
    return (
      <Fragment key={prefix}>
        <li
          key={`title-${title}`}
          className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-secondary bg-background/50"
        >
          {title}
        </li>
        {entries.map((entry, i) => (
          <SummaryEntryRow
            key={`${prefix}-${entryRowKey(entry, i, athleteGenders)}`}
            entry={entry}
            canEdit={canEdit}
            meetId={meetId}
            meetName={meetName}
            athletes={athletes}
            athleteGenders={athleteGenders}
            eventLabel={entry.event}
            allEntries={displayEntries}
            individualEventOptions={individualEventOptions}
            editableSeedKeys={editableSeedKeySet}
            eventNumberOptions={eventNumberOptions}
            forceEventNumber={true}
          />
        ))}
      </Fragment>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-medium text-foreground-secondary text-foreground-secondary uppercase tracking-wide">
          Roster Summary
        </h2>
        {headerAction}
      </div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Search athletes or events..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
        />
        <button
          onClick={() => setViewByEvent(!viewByEvent)}
          className="text-xs font-medium text-foreground-secondary hover:text-foreground whitespace-nowrap"
        >
          {viewByEvent ? "Sort by Athlete" : "Sort by Event"}
        </button>
      </div>
      {!hasContent ? (
        <div className="border border-border border-border-secondary rounded-xl px-4 py-10 text-center text-sm text-foreground-secondary text-foreground-secondary bg-background bg-background">
          No entries yet.
        </div>
      ) : (
      <div className="space-y-3">
        {viewByEvent && (
          <div>
            {sortedEventHeaders.map((group) => {
              return (
              <div key={group.header} className="mb-4 border border-border-secondary rounded-xl overflow-hidden bg-background">
                <div className="px-4 py-2.5 text-sm font-medium text-foreground-primary bg-background/50">
                  {group.header}
                </div>
                <ul className="divide-y dark:divide-zinc-800">
                  {group.entries.sort((a, b) => compareByPlace(a, b, hasImportedResults)).map((entry, j) => (
                      <SummaryEntryRow
                          key={`event-${entryRowKey(entry, j, athleteGenders)}`}
                          entry={entry}
                          canEdit={canEdit}
                          meetId={meetId}
                          meetName={meetName}
                          athletes={athletes}
                          athleteGenders={athleteGenders}
                          allEntries={displayEntries}
                          individualEventOptions={individualEventOptions}
                          editableSeedKeys={editableSeedKeySet}
                          eventNumberOptions={eventNumberOptions}
                          showAthleteInfo={true}
                          skipRelayLabel={true}
                          eventLabel={entry.entryType === "relay_team" ? `Relay ${displayRelayLetter(entry.relayLetter)}` : undefined}
                      />
                  ))}
                </ul>
              </div>
              )
            })}
          </div>
        )}
        {!viewByEvent && (
          <>
            {filteredMyEntries.length > 0 ? (
              <div key="my-entries" className="rounded-xl overflow-hidden border border-border-secondary border-primary bg-primary/5 shadow-sm">
                <div className="group flex items-center gap-2 px-4 py-2 text-sm font-medium border-b dark:border-zinc-800 text-[var(--brand-color-primary-active)] dark:text-[var(--brand-color-primary-hover)]">
                  <AthleteAvatar 
                    image={athletes.find(a => a.id === viewerAthleteId)?.image} 
                    name={athleteNames.get(viewerAthleteId!) || "My Profile"}
                  />
                  <span className="group-hover:text-[var(--brand-color-primary-active)]">
                    {athleteNames.get(viewerAthleteId!)}
                  </span>
                </div>
                <ul className="divide-y dark:divide-zinc-800">
                  {filteredMyEntries.map((entry, i) => (
                    <SummaryEntryRow
                      key={`mine-${entryRowKey(entry, i, athleteGenders)}`}
                      entry={entry}
                      canEdit={canEdit}
                      meetId={meetId}
                      meetName={meetName}
                      athletes={athletes}
                      athleteGenders={athleteGenders}
                      eventLabel={
                        entry.entryType === "relay_team" ? entry.event : undefined
                      }
                      allEntries={displayEntries}
                      individualEventOptions={individualEventOptions}
                      editableSeedKeys={editableSeedKeySet}
                      eventNumberOptions={eventNumberOptions}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {filteredRelays.length > 0 ? (
              <div key="relays" className="border border-border border-border-secondary rounded-xl overflow-hidden bg-background bg-background">
                <div className="px-4 py-2.5 text-sm font-medium border-b dark:border-zinc-800 text-foreground-primary">
                  Relays
                </div>
                <ul className="divide-y dark:divide-zinc-800">
                  {renderRelayGroup("Women's", filteredRelays.filter(
                    (e) => effectiveRelayGender(e, athleteGenders) === "F"
                  ), "womens")}
                  {renderRelayGroup("Men's", filteredRelays.filter(
                    (e) => effectiveRelayGender(e, athleteGenders) === "M"
                  ), "mens")}
                  {renderRelayGroup("Mixed", filteredRelays.filter(
                    (e) => effectiveRelayGender(e, athleteGenders) === "X"
                  ), "mixed")}
                  {filteredRelays.filter(
                    (e) => effectiveRelayGender(e, athleteGenders) === ""
                  ).map((entry, i) => (
                <SummaryEntryRow
                  key={`other-${entryRowKey(entry, i, athleteGenders)}`}
                  entry={entry}
                  canEdit={canEdit}
                  meetId={meetId}
                  meetName={meetName}
                  athletes={athletes}
                  athleteGenders={athleteGenders}
                  allEntries={displayEntries}
                  individualEventOptions={individualEventOptions}
                  editableSeedKeys={editableSeedKeySet}
                  eventNumberOptions={eventNumberOptions}
                  forceEventNumber={true}
                />
              ))}
                </ul>
              </div>
            ) : null}
            {filteredOtherGrouped.map((athleteGroup) => {
              const events = [...athleteGroup.entries].sort(compareIndividualEntries)
              const athleteData = athletes.find(a => a.id === athleteGroup.entries[0]?.athleteId);
              return (
                <div
                  key={athleteGroup.name}
                  className="border border-border border-border-secondary rounded-xl overflow-hidden bg-background bg-background"
                >
                  <Link
                    href={`/athletes/${athleteGroup.entries[0]?.athleteId}`}
                    className="group flex items-center gap-2 block px-4 py-2 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary transition-colors border-b dark:border-zinc-800"
                  >
                    <AthleteAvatar image={athleteData?.image} name={athleteGroup.name} />
                    <span className="group-hover:text-[var(--brand-color-primary-active)]">
                      {athleteGroup.name}
                    </span>
                  </Link>
                  <ul className="divide-y dark:divide-zinc-800">
                    {events.map((entry, i) => (
                      <SummaryEntryRow
                        key={`${athleteGroup.entries[0]?.athleteId}-${entryRowKey(entry, i, athleteGenders)}`}
                        entry={entry}
                        canEdit={canEdit}
                        meetId={meetId}
                        meetName={meetName}
                        athletes={athletes}
                        athleteGenders={athleteGenders}
                        allEntries={displayEntries}
                        individualEventOptions={individualEventOptions}
                        editableSeedKeys={editableSeedKeySet}
                        eventNumberOptions={eventNumberOptions}
                      />
                    ))}
                  </ul>
                </div>
              )
            })}
          </>
        )}
      </div>
      )}
    </section>
  )
}

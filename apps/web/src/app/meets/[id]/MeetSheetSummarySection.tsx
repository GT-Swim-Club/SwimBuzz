"use client"

import { isMixedIndividualEvent, resolveEntryEventNumber } from "@/lib/meet/event-number"
import { useEffect, useOptimistic, useRef, useState, useTransition, Fragment, type ReactNode } from "react"
import Link from "next/link"
import {
  alternateLabel,
  eventGenderWord,
  rosterNameFirstLast,
  rosterNamePreferred,
  splitRosterName,
  roundFilterIncludes,
  roundFilterChips,
  roundFilterLabel,
  rosterSummaryScopeLabel,
  rosterSummarySessions,
  rosterSummaryTitle,
  relayLegLabel,
  relayLegOrdinal,
  relayLegSubSplitList,
  relayLegSubSplitTimes,
  sessionIncludes,
  SUMMARY_ROUNDS,
  type SummaryRoundKind,
  type MeetHeaderDetails,
  type MeetSessionOrder,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfRow,
  type RosterSummaryPdfSection,
  type SetHeatLaneInput,
  HEAT_LANE_EDITS_OVERRIDE_IMPORTS,
  relayDisplayName,
  relayLetterTeam,
  teamOfAthletes,
  teamPillTones,
  type TeamPillTone,
} from "@swimbuzz/shared"
import type { MeetResultEntry, SheetEntry, SheetSummary } from "@/lib/meet/meet-sheet-summary"
import {
  applyCoachHeatLane,
  attachCoachHeatLanes,
  canEditHeatLane,
  coachRowHeatLane,
  coachRowRound,
  heatLaneRowIdentity,
  heatLaneSlot,
  importedRowHeatLane,
  isHeatLaneOverridesSummary,
  parseSetHeatLaneInput,
  upsertHeatLaneOverride,
} from "@/lib/meet/heat-lane-overrides"
import {
  compareIndividualEntries,
  dropSeedOnlyAfterResults,
  displaySeedRank,
  sheetAlternateNumber,
  finalsSeedRank,
  entryDisplaySplits,
  expandIndividualResultRows,
  groupSheetByAthlete,
  inferResultHeatTotals,
  isTimedFinalsEntry,
  isTimedFinalsRound,
  uniqueRelayTeams,
} from "@/lib/meet/meet-sheet-summary"
import { canonicalizeStrokeEvent, compareRelayEvents, normalizeEventName } from "@/lib/swim/swim-parse"
import {
  isRosterOnlySheetEntry,
  type MeetSignupEventOption,
} from "@/lib/meet/meet-signup"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  isRealRelaySwimmerName,
  leadoffSwimTags,
  relaySplitSwimTags,
  relayTeamKey,
  relayTeamPlace,
  relayTeamTime,
  sanitizeRelaySplitTime,
} from "@/lib/meet/relay-results"
import type { RelayLegSwim } from "@/lib/meet/relay-splits"
import { displayMeetResultTags } from "@/lib/swim/swim-tags"
import { formatDisplayTime, formatSeedTimeDelta, parseTime } from "@/lib/utils"
import { athletePath, relayAnchorId } from "@/lib/slug"
import { LedgerIcon } from "@/components/meet/Ledger"
import HoverDetail from "@/components/ui/HoverDetail"
import { SegmentedToggle, segmentedIconOptionClass } from "@/components/ui/SegmentedToggle"
import RosterName from "@/components/athlete/RosterName"
import TeamPill, { teamPillColumnWidth } from "@/components/meet/TeamPill"
import EditMeetSwimButton from "./EditMeetSwimButton"
import { removeMeetSwimTime } from "./meet-swims.actions"
import EditSheetSeedButton from "./EditSheetSeedButton"
import type { HeatLaneEdit } from "./HeatLaneInlineEdit"
import RemoveRosterOnlyButton from "./RemoveRosterOnlyButton"
import { EditRelayButton } from "./MeetRelayEditor"
import MeetAddMenu from "./MeetAddMenu"
import ShareRosterSummaryButton from "./ShareRosterSummaryButton"
import JumpRail, { JUMP_RAIL_LAYOUT_CLASS, JUMP_RAIL_LETTERS, type JumpRailItem } from "@/components/ui/JumpRail"
import { MenuDivider, MenuItem, MenuSubmenu, menuPanel } from "./MeetMenu"
import SummaryRow, { EventBadge, SUMMARY_INSET, SummaryRowFold, type RowDisplay, type RowDensity, type RowResult } from "./SummaryRow"
import type { DetailRound, RemoveTimeAction, SwimDetail } from "./SwimDetailModal"
import { useEscapeToClose } from "@/lib/use-escape-to-close"
import { buildRosterSummary, rosterSummaryHasResults } from "@/lib/meet/roster-summary-display"
import {
  DEFAULT_SUMMARY_VIEW,
  summaryViewSearch,
  type SummaryViewMode,
  type SummaryViewState,
} from "@/lib/meet/roster-summary-view"

/** Card headers inset like the rows below them, so badges and avatars line up. */
const summaryHeaderInset = { paddingLeft: SUMMARY_INSET, paddingRight: SUMMARY_INSET }

function formatHeat(entry: SheetSummary["entries"][number]) {
  // Alternates are finals-only; prelim rows may still carry the flag from merge.
  if (isAlternateRow(entry)) {
    return alternateLabel(sheetAlternateNumber(entry))
  }
  const { heat, heatTotal } = rowHeat(entry)
  if (heat == null || heat < 1) return null
  if (heatTotal != null) return `Heat ${heat} of ${heatTotal}`
  return `Heat ${heat}`
}

function isAlternateRow(entry: SheetSummary["entries"][number]): boolean {
  return Boolean(entry.alternate) && entry.resultRound !== "P"
}

/** The heat a row swims in its own round (prelims, finals, or the only one). */
function rowHeat(entry: SheetSummary["entries"][number]): { heat?: number; heatTotal?: number } {
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
  return { heat, heatTotal }
}

function individualLane(entry: SheetSummary["entries"][number]): number | undefined {
  if (entry.alternate) return undefined
  if (entry.resultRound === "F") return entry.finalLane ?? entry.lane
  if (entry.resultRound === "P") return entry.prelimLane ?? entry.lane
  return entry.lane ?? entry.finalLane ?? entry.prelimLane
}

function relayLane(entry: SheetSummary["entries"][number]): number | undefined {
  if (entry.alternate) return undefined
  if (entry.entryType !== "relay_team") return entry.lane
  const round = effectiveRelayRound(entry)
  if (round === "F") return entry.finalLane ?? entry.lane
  if (round === "P") return entry.prelimLane ?? entry.lane
  return entry.lane ?? entry.prelimLane ?? entry.finalLane
}

function finalsPodiumPlace(entry: SheetSummary["entries"][number]): number | undefined {
  if (entry.entryType === "relay_team") {
    const round = effectiveRelayRound(entry)
    if (round === "P") return undefined
    const place = relayTeamPlace(entry)
    return place != null && place >= 1 && place <= 3 ? place : undefined
  }
  // A swim-off only breaks a tie for a qualifying spot — its place isn't a finish.
  if (entry.resultRound === "P" || entry.isSwimOff) return undefined
  if (entry.finalPlace != null && entry.finalPlace >= 1 && entry.finalPlace <= 3) {
    return entry.finalPlace
  }
  if (entry.resultPlace != null && entry.resultPlace >= 1 && entry.resultPlace <= 3) {
    return entry.resultPlace
  }
  return undefined
}

function formatHeatNumber(heat: string | null): string | undefined {
  return heat?.replace(/^Heat\s+/i, "") || undefined
}

type SummaryEntry = SheetSummary["entries"][number]

function entryRowKey(
  entry: SummaryEntry,
  i: number,
  athleteGenders?: Map<string, "M" | "F">
) {
  const gender = effectiveRelayGender(entry, athleteGenders)
  const athleteKey = entry.entryType !== "relay_team" ? `-${entry.athleteId}` : ""
  return `${entry.event}-${entry.eventNumber}-${entry.entryType}-${gender}-${entry.relayLetter ?? ""}-${entry.relayRound ?? ""}-${entry.resultRound ?? ""}-${entry.relayLeadoffSource ?? ""}-${entry.relayLeadoffRound ?? ""}${entry.relayLeadoffMixed ? "-mixed" : ""}-${entry.isRelayLeadoff ? "leadoff" : ""}${athleteKey}-${i}`
}

function resolveDisplayEventNumber(
  entry: SummaryEntry,
  athleteGenders?: Map<string, "M" | "F">,
  eventOptions?: MeetSignupEventOption[]
): number {
  return resolveEntryEventNumber(entry, athleteGenders, eventOptions)
}

type RoundResult = {
  label: string | null
  time?: string
  status?: string
  place?: number
  points?: number
  seed?: string
  /** What the row's delta measures against when it isn't `seed`: a finals swim's prelims seed. */
  deltaSeed?: string
}

const ROUND_LABELS: Record<SummaryRoundKind, string> = { P: "Prelims", F: "Finals", T: "Timed Finals" }

/** A row's round before it has swum — the coach's when no import gives it one (unless `coach` is false). */
function pendingRoundLabel(entry: SummaryEntry, coach = true): string | null {
  if (entry.entryType === "relay_team") {
    const round = effectiveRelayRound(entry)
    if (round === "P") return "Prelims"
    if (round === "F") return "Finals"
  } else {
    if (entry.resultRound === "P") return "Prelims"
    if (entry.resultRound === "F") return "Finals"
  }
  if (isTimedFinalsRound(entry.round)) return "Timed Finals"
  const coachRound = coach ? coachRowRound(entry) : undefined
  return coachRound ? ROUND_LABELS[coachRound] : null
}

/**
 * The single round a summary row represents: its time/status, place and the seed it's measured
 * against. `coach` false leaves out a coach-picked round, to tell whether an import gave it one.
 */
function rowRoundResult(entry: SummaryEntry, allEntries?: SummaryEntry[], coach = true): RoundResult {
  const timedOpts = allEntries ? { allEntries } : undefined
  const nt = entry.timeStatus === "NT" ? "NT" : undefined

  if (entry.isSwimOff) {
    return {
      label: "Swim-off",
      time: entry.resultTime,
      status: entry.resultStatus,
      place: entry.resultPlace,
      points: entry.resultPoints,
    }
  }

  if (entry.entryType === "relay_team") {
    const round = effectiveRelayRound(entry)
    const time = relayTeamTime(entry) ?? undefined
    // DQ / NS / … in place of a time — a finals NS (scratched from finals) reads as unswum,
    // as for individual swims.
    const status =
      !time && entry.resultStatus && !(round === "F" && entry.resultStatus === "NS")
        ? entry.resultStatus
        : undefined
    // A timed final seeded only on a finals heat sheet (an event swum in the finals session) keeps
    // that sheet's seed once its results read as timed finals rather than finals.
    const seed =
      round === "F"
        ? entry.finalsSheetSeedTime
        : entry.seedTime || entry.prelimTime || entry.finalsSheetSeedTime || nt
    const label =
      round === "P"
        ? "Prelims"
        : round === "F"
          ? "Finals"
          : time || status
            ? isTimedFinalsEntry(entry)
              ? "Timed Finals"
              : "Finals"
            : pendingRoundLabel(entry, coach)
    return {
      label,
      time,
      status,
      place: time ? relayTeamPlace(entry) : undefined,
      points: time ? entry.resultPoints : undefined,
      seed,
      deltaSeed: round === "F" ? entry.prelimSeedTime : undefined,
    }
  }

  if (entry.resultRound === "P") {
    return {
      label: "Prelims",
      time: entry.prelimTime,
      status: entry.prelimStatus,
      place: entry.prelimPlace,
      points: entry.prelimPoints,
      seed: entry.seedTime || nt,
    }
  }

  const finalStatus = entry.finalStatus === "NS" ? undefined : entry.finalStatus

  if (entry.resultRound === "F") {
    // Finals seed = prelims time from results or finals heat sheet, not psych seed.
    const seed = entry.finalsSheetSeedTime
    if (isTimedFinalsEntry(entry, timedOpts)) {
      return {
        label: "Timed Finals",
        time: entry.finalTime ?? entry.resultTime,
        status: finalStatus ?? entry.resultStatus,
        place: entry.finalPlace ?? entry.resultPlace,
        points: entry.finalPoints ?? entry.resultPoints,
        seed,
      }
    }
    return {
      label: "Finals",
      time: entry.finalTime,
      status: finalStatus,
      place: entry.finalPlace,
      points: entry.finalPoints,
      seed,
      // The drop is from the prelims seed; the finals seed (the prelims time) stays in the detail's table.
      deltaSeed: entry.prelimSeedTime,
    }
  }

  const seed = entry.seedTime || entry.prelimTime || nt
  const timed = isTimedFinalsEntry(entry, timedOpts)
  if (entry.finalTime || finalStatus) {
    return {
      label: timed ? "Timed Finals" : "Finals",
      time: entry.finalTime,
      status: finalStatus,
      place: entry.finalPlace,
      points: entry.finalPoints,
      seed,
    }
  }
  if (entry.prelimTime || entry.prelimStatus) {
    return {
      label: "Prelims",
      time: entry.prelimTime,
      status: entry.prelimStatus,
      place: entry.prelimPlace,
      points: entry.prelimPoints,
      seed,
    }
  }
  if (entry.resultTime || entry.resultStatus) {
    return {
      label: timed ? "Timed Finals" : "Finals",
      time: entry.resultTime,
      status: entry.resultStatus,
      place: entry.resultPlace,
      points: entry.resultPoints,
      seed,
    }
  }
  return { label: pendingRoundLabel(entry, coach), seed: seed || entry.timeStatus }
}

/** The round a row stands for, for the round filter — a swim-off goes with prelims. */
function rowRoundKind(entry: SummaryEntry, allEntries?: SummaryEntry[]): SummaryRoundKind | null {
  const { label } = rowRoundResult(entry, allEntries)
  if (label === "Prelims" || label === "Swim-off") return "P"
  if (label === "Finals") return "F"
  return label === "Timed Finals" ? "T" : null
}

/** The round a row stands for, for the session filter — none for timed finals and swim-offs. */
function rowSessionRounds(entry: SummaryEntry, allEntries?: SummaryEntry[]): ("P" | "F")[] {
  const { label } = rowRoundResult(entry, allEntries)
  return label === "Prelims" ? ["P"] : label === "Finals" ? ["F"] : []
}

function buildIndividualRounds(entry: SheetEntry, allEntries?: SummaryEntry[]): DetailRound[] {
  if (entry.entryType === "relay_team") return []

  if (entry.isSwimOff) {
    return [
      {
        label: "Swim-off",
        time: entry.resultTime,
        place: entry.resultPlace,
        points: entry.resultPoints,
        status: entry.resultStatus,
        splits: entryDisplaySplits(entry),
      },
    ]
  }

  const timedOpts = { allEntries }
  const rounds: DetailRound[] = []
  const hasPrelim = Boolean(entry.prelimTime || entry.prelimStatus)
  const hasFinal = Boolean(entry.finalTime || (entry.finalStatus && entry.finalStatus !== "NS"))

  if (hasPrelim) {
    const prelimHeat =
      entry.prelimHeat != null && entry.prelimHeat > 0
        ? entry.prelimHeatTotal != null
          ? `${entry.prelimHeat} of ${entry.prelimHeatTotal}`
          : String(entry.prelimHeat)
        : entry.resultRound === "P"
          ? formatHeatNumber(formatHeat(entry))
          : undefined
    rounds.push({
      label: "Prelims",
      time: entry.prelimTime,
      place: entry.prelimPlace,
      points: entry.prelimPoints,
      status: entry.prelimStatus,
      heat: prelimHeat,
      startTime: entry.prelimStartTime || (entry.resultRound === "P" ? entry.startTime : undefined) || undefined,
      lane: entry.prelimLane ?? (entry.resultRound === "P" ? individualLane(entry) : undefined),
      splits: entry.prelimSplits ?? (entry.resultRound === "P" ? entry.splits : undefined) ?? [],
      // From the finals row, seedTime/seedRank are the finals seed; the prelims seed is kept aside.
      ...(entry.resultRound === "F"
        ? { seedTime: entry.prelimSeedTime, seedRank: entry.prelimSeedRank }
        : { seedTime: entry.seedTime, seedRank: entry.seedRank }),
    })
  }

  if (hasFinal) {
    const timed = isTimedFinalsEntry(entry, timedOpts)
    const finalHeat =
      entry.finalHeat != null && entry.finalHeat > 0
        ? entry.finalHeatTotal != null
          ? `${entry.finalHeat} of ${entry.finalHeatTotal}`
          : String(entry.finalHeat)
        : undefined
    rounds.push({
      label: timed ? "Timed Finals" : "Finals",
      time: entry.finalTime,
      place: entry.finalPlace,
      points: entry.finalPoints,
      podium: true,
      status: entry.finalStatus === "NS" ? undefined : entry.finalStatus,
      heat: finalHeat,
      startTime: entry.finalStartTime || (entry.resultRound === "F" ? entry.startTime : undefined) || undefined,
      lane: entry.finalLane,
      splits: entry.finalSplits ?? (entry.resultRound === "F" ? entry.splits : undefined) ?? [],
      seedTime: timed ? entry.seedTime : entry.finalsSheetSeedTime,
      seedRank: timed ? entry.seedRank : finalsSeedRank(entry),
      // The header measures a finals swim against the prelims seed; the table, the finals seed.
      headSeedTime: timed
        ? undefined
        : entry.resultRound === "F"
          ? entry.prelimSeedTime
          : entry.seedTime || undefined,
    })
  }

  if (
    rounds.length === 0 &&
    (entry.resultTime || entry.resultStatus || entryDisplaySplits(entry).length > 0)
  ) {
    const timed = isTimedFinalsEntry(entry, timedOpts)
    rounds.push({
      label: timed ? "Timed Finals" : "Result",
      time: entry.resultTime,
      place: entry.resultPlace,
      points: entry.resultPoints,
      podium: true,
      status: entry.resultStatus,
      heat: formatHeatNumber(formatHeat(entry)),
      lane: individualLane(entry),
      splits: entryDisplaySplits(entry),
      seedTime: entry.seedTime,
      seedRank: entry.seedRank,
    })
  }

  // With both rounds' heat sheets, each round has its own start time. Otherwise the entry carries
  // one; with both rounds shown, it only goes on the round this row is known to be.
  const prelimsRound = rounds.find((r) => r.label === "Prelims")
  const finalsRound = rounds.find((r) => r.label === "Finals")
  if (prelimsRound && entry.prelimStartTime) prelimsRound.startTime = entry.prelimStartTime
  if (finalsRound && entry.finalStartTime) finalsRound.startTime = entry.finalStartTime
  const startTime = entry.prelimStartTime || entry.finalStartTime ? undefined : entry.startTime || undefined
  if (startTime) {
    const round =
      rounds.length === 1
        ? rounds[0]
        : entry.resultRound === "P"
          ? rounds.find((r) => r.label === "Prelims")
          : entry.resultRound === "F"
            ? rounds.find((r) => r.label !== "Prelims")
            : undefined
    if (round) round.startTime = startTime
  }

  return rounds
}

function initialsFromName(name?: string | null) {
  if (name?.includes(",")) {
    const [lastName, firstName] = name.split(",").map((s) => s.trim())
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

/** Numbers ascending, with missing ones last. */
function compareMissingLast(a: number | undefined, b: number | undefined): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1
  return a - b
}

/** Seed time fastest first (NT last), then seed rank. */
function compareBySeed(a: SummaryEntry, b: SummaryEntry): number {
  const isNt = (time?: string) => !time || /^nt$/i.test(time.trim())
  const isNtA = isNt(a.seedTime)
  const isNtB = isNt(b.seedTime)
  if (isNtA !== isNtB) return isNtA ? 1 : -1
  if (!isNtA && !isNtB) {
    const msA = parseTime(a.seedTime!)
    const msB = parseTime(b.seedTime!)
    if (Number.isFinite(msA) && Number.isFinite(msB) && msA !== msB) return msA - msB
  }
  return compareMissingLast(
    a.seedRank != null ? Number(a.seedRank) : undefined,
    b.seedRank != null ? Number(b.seedRank) : undefined
  )
}

/** Rounds in the order an event lists them: finals, then prelims (and swim-offs), then timed finals. */
const ROUND_ORDER: Record<SummaryRoundKind, number> = { F: 0, P: 1, T: 2 }

/** An export's round subsections: a swim-off gets its own, between finals and prelims. */
type ExportRoundKind = SummaryRoundKind | "S"
const EXPORT_ROUND_ORDER: Record<ExportRoundKind, number> = { F: 0, S: 1, P: 2, T: 3 }
const EXPORT_ROUND_LABELS: Record<ExportRoundKind, string> = { ...ROUND_LABELS, S: "Swim-off" }

/**
 * An event's rows (in swim order) by round — finals, swim-offs, prelims, then timed finals — or
 * null when a row's round isn't known.
 */
function entriesByRound(
  entries: SummaryEntry[],
  allEntries: SummaryEntry[]
): { kind: ExportRoundKind; entries: SummaryEntry[] }[] | null {
  const byKind = new Map<ExportRoundKind, SummaryEntry[]>()
  for (const entry of entries) {
    const kind = entry.isSwimOff ? "S" : rowRoundKind(entry, allEntries)
    if (!kind) return null
    byKind.set(kind, [...(byKind.get(kind) ?? []), entry])
  }
  return [...byKind]
    .sort(([a], [b]) => EXPORT_ROUND_ORDER[a] - EXPORT_ROUND_ORDER[b])
    .map(([kind, entries]) => ({ kind, entries }))
}

/**
 * One event's rows in swim order: by place once its results are in, by heat and lane once heats
 * are out, else by seed. Decided per event, so finals still follow heat & lane while only prelims
 * results are in. Rows without a place (DQ, NS) follow the placed ones; alternates come last.
 */
function sortEventEntries(entries: SummaryEntry[], allEntries: SummaryEntry[]): SummaryEntry[] {
  const place = (entry: SummaryEntry) => rowRoundResult(entry, allEntries).place
  const lane = (entry: SummaryEntry) =>
    entry.entryType === "relay_team" ? relayLane(entry) : individualLane(entry)
  const roundOrder = (entry: SummaryEntry) => {
    const kind = rowRoundKind(entry, allEntries)
    return kind ? ROUND_ORDER[kind] : 3
  }
  // Within a round, by place once it has results, else by heat & lane once it has heats.
  const rounds = new Map<number, SummaryEntry[]>()
  for (const entry of entries) rounds.set(roundOrder(entry), [...(rounds.get(roundOrder(entry)) ?? []), entry])
  const placedRounds = new Set([...rounds].filter(([, rows]) => rows.some((e) => place(e) != null)).map(([r]) => r))
  const heatedRounds = new Set(
    [...rounds].filter(([, rows]) => rows.some((e) => rowHeat(e).heat != null)).map(([r]) => r)
  )
  return [...entries].sort((a, b) => {
    if (isAlternateRow(a) !== isAlternateRow(b)) return isAlternateRow(a) ? 1 : -1
    const round = roundOrder(a)
    if (round !== roundOrder(b)) return round - roundOrder(b)
    const placed = placedRounds.has(round)
    const heated = heatedRounds.has(round)
    if (placed) {
      const byPlace = compareMissingLast(place(a), place(b))
      if (byPlace !== 0) return byPlace
    }
    if (heated) {
      const byHeat = compareMissingLast(rowHeat(a).heat, rowHeat(b).heat)
      if (byHeat !== 0) return byHeat
      const byLane = compareMissingLast(lane(a), lane(b))
      if (byLane !== 0) return byLane
    }
    return compareBySeed(a, b) || compareIndividualEntries(a, b)
  })
}

function AthleteAvatar({
  image,
  name,
  compact = false,
}: {
  image?: string | null
  name: string
  compact?: boolean
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-secondary bg-accent/10 font-medium text-accent ${
        compact ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]"
      }`}
    >
      {image ? (
        <img src={image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initialsFromName(name)
      )}
    </span>
  )
}

/** Women, then men, then mixed, then unknown — the order a shared event number's groups list in. */
function genderOrder(gender: string): number {
  return gender === "F" ? 0 : gender === "M" ? 1 : gender === "X" ? 2 : 3
}

/** Detail-modal title in one format: "Men 200 Free Relay", "Women 100 Fly", "Mixed 200 Medley Relay". */
function detailEventTitle(event: string, gender: string | null | undefined): string {
  const name = canonicalizeStrokeEvent(event)
    .replace(/\b(men'?s?|women'?s?|boys'?|girls'?|mixed|co-?ed)\s+/gi, "")
    .trim()
  const prefix = gender === "M" ? "Men" : gender === "F" ? "Women" : gender === "X" ? "Mixed" : ""
  return [prefix, name].filter(Boolean).join(" ")
}

/** Fired by the sign-ups & roster card to switch this section to the roster list. */
export const SHOW_ROSTER_EVENT = "meet:show-roster"

type AthleteRecord = {
  id: string
  slug?: string | null
  name: string
  gender?: "M" | "F"
  image?: string | null
  /** Coach-only: athlete has no SwimCloud ID, so times can't sync. */
  missingSwimCloud?: boolean
  /** Coach-only: has a SwimCloud ID but times have never been imported. */
  timesNeverImported?: boolean
}

type RowContext = {
  athleteGenders?: Map<string, "M" | "F">
  allEntries?: SummaryEntry[]
  eventNumberOptions?: MeetSignupEventOption[]
  /** Each athlete's team at a meet whose results name several of ours ("Gold"); empty otherwise. */
  athleteTeams?: Record<string, string>
  /** Each of those teams' pill color. */
  teamTones?: Record<string, TeamPillTone>
}

/**
 * What a summary row shows — shared by the on-screen row and the PDF export. `athleteId` is the
 * athlete whose section the row sits in, so their relay rows can show the leg they swam.
 */
function summaryRowView(
  entry: SummaryEntry,
  ctx: RowContext,
  eventView: boolean,
  athleteId?: string
) {
  const { athleteGenders, allEntries, eventNumberOptions, athleteTeams = {}, teamTones = {} } = ctx
  const isRelay = entry.entryType === "relay_team"
  // A relay whose letter names one of our teams ("White A") is that team's, swimmers listed or not.
  const letterTeam = isRelay ? relayLetterTeam(displayRelayLetter(entry.relayLetter), Object.values(athleteTeams)) : null
  // By event, each row names its team (a relay, the one its letter names, else the one most of its
  // swimmers are on); by athlete, the athlete's header does.
  const teamPill = eventView
    ? isRelay
      ? (letterTeam?.team ?? teamOfAthletes((entry.relaySwimmers ?? []).map((s) => s.athleteId), athleteTeams))
      : athleteTeams[entry.athleteId]
    : undefined
  const eventNumber = resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions)
  const res = rowRoundResult(entry, allEntries)
  const podiumPlace = finalsPodiumPlace(entry)
  // "Relay A", or with our team's side before "Relay": "White Relay A".
  const relayLetter = isRelay ? relayDisplayName("", displayRelayLetter(entry.relayLetter)) : undefined
  // Under an athlete, a relay also shows the leg they swam and their split (a leg 1 split is
  // their leadoff time, so leadoffs don't get rows of their own).
  const swimmer =
    isRelay && !eventView && athleteId
      ? entry.relaySwimmers?.find((s) => s.athleteId === athleteId)
      : undefined
  const split = sanitizeRelaySplitTime(swimmer?.splitTime)
  const legSplit = split ? formatDisplayTime(split) : null
  // The leg's own 50s, when the results time them (relay-splits.ts notes where they come from).
  // Only the exports show them — the PDF in split columns, like an individual swim's.
  const legSubSplits = relayLegSubSplitList(swimmer?.splits, formatDisplayTime)
  const relayLeg = swimmer ? (relayLegLabel(swimmer.leg, legSplit) ?? undefined) : undefined
  // On screen the leg goes after the relay's name, "200 Free Relay A (2nd)", and the split under
  // its time.
  const legNumber = swimmer?.leg && swimmer.leg > 0 ? swimmer.leg : undefined

  const heat = formatHeat(entry)
  const lane = isRelay ? relayLane(entry) : individualLane(entry)
  // Heat & lane in their own column, compact like the PDF's: "Heat 2 of 4" + lane 5 → "H2 of 4 · L5".
  const heatLane =
    [heat?.replace(/^Heat\s+/i, "H"), lane != null ? `L${lane}` : null].filter(Boolean).join(" · ") || null

  const tags = !isRelay ? displayMeetResultTags(entry.resultTags ?? "") : null
  const sub = tags ?? ""

  const result: RowResult = entry.rosterOnly
    ? { kind: "none" }
    : res.time || res.status
      ? {
          kind: "done",
          time: res.time,
          status: res.status,
          delta: (() => {
            const seed = res.deltaSeed && res.deltaSeed !== "NT" ? res.deltaSeed : res.seed
            return seed && res.time && seed !== "NT" ? formatSeedTimeDelta(seed, res.time) : null
          })(),
          place: res.place,
          points: res.points,
          podium: podiumPlace != null && podiumPlace === res.place,
        }
      : res.seed
        ? { kind: "seed", seed: res.seed, seedRank: displaySeedRank(entry) }
        : { kind: "none" }

  const eventName = entry.rosterOnly ? "Attending" : entry.event
  return {
    isRelay,
    eventNumber,
    res,
    podiumPlace,
    relayLetter,
    relayLeg,
    relayLegNumber: swimmer?.leg,
    legSplit,
    legSubSplits,
    heat,
    lane,
    heatLane,
    startTime: entry.startTime || null,
    sub,
    result,
    eventName,
    badgeNumber: !eventView && eventNumber > 0 ? eventNumber : undefined,
    // A relay names its letter ("200 Free Relay A"); its round goes beside the name and, under an
    // athlete, their leg and split on the line below.
    label: eventView
      ? isRelay
        ? relayLetter
        : entry.athleteName
      : isRelay
        ? relayDisplayName(eventName, displayRelayLetter(entry.relayLetter), false, entry.gender)
        : eventName,
    team: !eventView && isRelay && swimmer ? (legSplit ?? undefined) : undefined,
    teamPill,
    teamTone: teamPill ? teamTones[teamPill] : undefined,
    legNumber: !eventView && isRelay ? legNumber : undefined,
    round: entry.rosterOnly ? null : res.label,
  }
}

/** Medley relay legs in swim order. */
const MEDLEY_STROKES = ["BK", "BR", "FL", "FR"]

/** One relay leg as the summary and its exports list it under an event. */
type RelayLegView = {
  name: string
  /** The leg's split ("" when there isn't one). */
  split: string
  /** The leg's own interval splits (the 50s of a 100 leg), [] when the results don't time them. */
  subSplits: string[]
}

/**
 * A relay's swimmers in leg order, each with their split and sub-splits, leaving out "Leg 1"-style
 * placeholders for an unknown roster.
 */
function relayLegs(entry: SummaryEntry): RelayLegView[] {
  return [...(entry.relaySwimmers ?? [])]
    .filter((s) => isRealRelaySwimmerName(s.name))
    .sort((a, b) => a.leg - b.leg)
    .map((s) => {
      const split = sanitizeRelaySplitTime(s.splitTime)
      return {
        name: s.name,
        split: split ? formatDisplayTime(split) : "",
        subSplits: relayLegSubSplitTimes(s.splits, formatDisplayTime),
      }
    })
}

/** An individual swim's interval splits in distance order, leaving out missing ones ("No Data"). */
function swimSplits(entry: SummaryEntry): { distance: number; time: string }[] {
  return entryDisplaySplits(entry)
    .map((s) => ({ distance: s.distance, time: sanitizeRelaySplitTime(s.splitTime) ?? "" }))
    .filter((s) => s.time)
    .sort((a, b) => a.distance - b.distance)
}

/** A summary row for the PDF export, honoring the viewer's Show round / Show heat & lane toggles. */
function summaryRowPdf(
  entry: SummaryEntry,
  ctx: RowContext,
  display: RowDisplay,
  eventView = false,
  athleteId?: string
): RosterSummaryPdfRow {
  const view = summaryRowView(entry, ctx, eventView, athleteId)
  // Relay names are compact: "200 Medley A" (or "Relay A" under an event title), with the
  // letter folded in rather than repeated in the meta — spelled out ("200 Medley Relay A") where
  // the line has room.
  const relayLetter = displayRelayLetter(entry.relayLetter)
  const relayName = eventView ? view.label : relayDisplayName(entry.event, relayLetter, true, entry.gender)
  const relayFullName = eventView ? undefined : relayDisplayName(entry.event, relayLetter, false, entry.gender)
  const startTime = (display.showHeatLane && entry.startTime) || undefined
  // As on screen, a relay athlete's leg follows the name ("200 Medley A (4th)") and their split
  // sits under the time; the round rides beside the name (then any result tags). Under the name go
  // the leg's own 50s when the results time them, in columns like an individual swim's splits.
  const legs = view.isRelay ? relayLegs(entry) : []
  const heatLane = display.showHeatLane ? view.heatLane : null
  return {
    eventNumber: view.badgeNumber,
    label: (view.isRelay ? relayName : view.label) ?? "",
    fullLabel: view.isRelay ? relayFullName : undefined,
    labelNote: view.legNumber != null ? relayLegOrdinal(view.legNumber) : undefined,
    team: view.teamPill,
    teamTone: view.teamTone,
    resultNote: view.team,
    // By event the round is its own gold tag; by athlete it leads the grey text after the label.
    round: (eventView && display.showRound && view.round) || undefined,
    sub:
      [!eventView && display.showRound ? view.round : null, view.isRelay ? null : view.sub]
        .filter(Boolean)
        .join(" · ") || undefined,
    heatLane: heatLane || undefined,
    startTime,
    legs: view.isRelay ? legs.map((leg) => leg.name) : undefined,
    legSplits: view.isRelay ? legs.map((leg) => leg.split) : undefined,
    legSubSplits: legs.some((leg) => leg.subSplits.length) ? legs.map((leg) => leg.subSplits) : undefined,
    splits: view.isRelay ? (view.team && view.legSubSplits.length ? view.legSubSplits : undefined) : swimSplits(entry),
    result: view.result,
  }
}

/**
 * A relay row's anchors (relayAnchorId of its team key, and `swim-<id>` of its leadoff and split
 * swims), which open it from a link. Under an event the one row carries them all; under athletes,
 * each copy carries its own swimmer's leg, and the team's goes on the first leg's copy.
 */
function relayRowAnchors(
  entry: SummaryEntry,
  legSwims: RelayLegSwim[],
  athleteGenders: Map<string, "M" | "F"> | undefined,
  sectionAthleteId: string | undefined,
  eventView: boolean
): string[] {
  const round = effectiveRelayRound(entry)
  const legs = (entry.relaySwimmers ?? []).filter((s) => s.leg > 0)
  const owns = (leg: (typeof legs)[number]) => eventView || (!!leg.athleteId && leg.athleteId === sectionAthleteId)
  const anchors: string[] = []
  const firstLeg = [...legs].filter((s) => s.athleteId).sort((a, b) => a.leg - b.leg)[0]
  const gender = effectiveRelayGender(entry, athleteGenders)
  if (eventView || (firstLeg && firstLeg.athleteId === sectionAthleteId)) {
    anchors.push(relayAnchorId(relayTeamKey(entry.event, entry.relayLetter, round, gender)))
  }
  for (const leg of legs) {
    if (!leg.athleteId || !owns(leg)) continue
    const tags =
      leg.leg === 1
        ? [leadoffSwimTags(entry.event, round, gender), leadoffSwimTags(entry.event, "", gender)]
        : [relaySplitSwimTags(entry.event, leg.leg, round, gender)]
    const swim = legSwims.find((s) => s.athleteId === leg.athleteId && tags.includes(s.tags))
    if (swim) anchors.push(`swim-${swim.id}`)
  }
  return anchors
}

function SummaryEntryRow({
  entry,
  display,
  canEdit,
  meetId,
  meetName,
  athletes,
  athleteGenders,
  allEntries,
  individualEventOptions,
  editableSeedKeys = new Set<string>(),
  eventNumberOptions,
  eventView = false,
  athleteId,
  mine = false,
  onHeatLaneSaving,
  heatLaneEditable = true,
  relayLegSwims = [],
  athleteTeams,
  teamTones,
}: {
  /** The meet's relay leadoff and split swims, anchored on their relays' rows. */
  relayLegSwims?: RelayLegSwim[]
  /** Each athlete's team at a meet whose results name several of ours; by event, rows show it. */
  athleteTeams?: Record<string, string>
  /** Each of those teams' pill color. */
  teamTones?: Record<string, TeamPillTone>
  entry: SummaryEntry
  display: RowDisplay
  canEdit?: boolean
  meetId?: string
  meetName?: string
  athletes?: AthleteRecord[]
  athleteGenders?: Map<string, "M" | "F">
  allEntries?: SummaryEntry[]
  individualEventOptions?: string[]
  editableSeedKeys?: Set<string>
  eventNumberOptions?: MeetSignupEventOption[]
  /** Rows sit under an event header: label by athlete / relay letter, no event badge. */
  eventView?: boolean
  /** The athlete whose section the row sits in (by-athlete view). */
  athleteId?: string
  /** The viewer's own row (by event), tinted so they can find it. */
  mine?: boolean
  /** Show a coach's heat & lane on the page while it saves (call inside the save's transition). */
  onHeatLaneSaving?: (input: SetHeatLaneInput) => void
  /** False once the meet is over: heat & lane are then read-only. */
  heatLaneEditable?: boolean
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [removingTime, startRemoveTime] = useTransition()
  const [removeTimeError, setRemoveTimeError] = useState<string | null>(null)
  const athleteRecord = athletes?.find((a) => a.id === entry.athleteId)
  const compact = display.density === "compact"
  const view = summaryRowView(
    entry,
    { athleteGenders, allEntries, eventNumberOptions, athleteTeams, teamTones },
    eventView,
    athleteId
  )
  const { isRelay, eventNumber, res, podiumPlace, relayLetter, heat, lane, heatLane, sub, result, eventName } =
    view
  // Rows split per round carry that round's swimId; timed-finals rows only have the result
  // ids. Used for the `#swim-<id>` anchor that athlete-profile links scroll to and open.
  const anchorSwimId =
    entry.swimId ?? entry.resultSwimId ?? entry.finalSwimId ?? entry.prelimSwimId
  // A relay opens from its team's anchor and its legs' swims (a leadoff or split on an athlete page).
  const rowAnchors = isRelay
    ? relayRowAnchors(entry, relayLegSwims, athleteGenders, athleteId, eventView)
    : anchorSwimId
      ? [`swim-${anchorSwimId}`]
      : []
  const detailTitle = entry.rosterOnly
    ? eventName
    : detailEventTitle(
        entry.event,
        isRelay
          ? effectiveRelayGender(entry, athleteGenders)
          : entry.gender || athleteGenders?.get(entry.athleteId)
      )
  // Under an event title a relay lists its swimmers and their splits, like the PDF; under an
  // athlete it's that athlete's leg alone.
  const legs = isRelay && eventView ? relayLegs(entry) : []
  const legTags = /\bmedley\b/i.test(entry.event) && legs.length === MEDLEY_STROKES.length ? MEDLEY_STROKES : null

  // Detail modal
  let detail: SwimDetail
  if (isRelay) {
    detail = {
      kind: "relay",
      eventNumber: eventNumber || undefined,
      title: detailTitle,
      subLine: [relayLetter, res.label].filter(Boolean).join(" · "),
      subLineLead: relayLetter || undefined,
      rounds: [
        {
          label: res.label ?? "Relay",
          time: res.time,
          status: res.status,
          place: res.place,
          points: res.points,
          podium: effectiveRelayRound(entry) !== "P",
          seedTime: res.seed && res.seed !== "NT" ? res.seed : undefined,
          headSeedTime: res.deltaSeed && res.deltaSeed !== "NT" ? res.deltaSeed : undefined,
          seedRank: displaySeedRank(entry),
          heat: formatHeatNumber(heat),
          startTime: entry.startTime || undefined,
          lane,
          splits: [],
        },
      ],
      relaySwimmers: [...(entry.relaySwimmers ?? [])]
        .sort((a, b) => a.leg - b.leg)
        .map((s) => ({ name: s.name, split: sanitizeRelaySplitTime(s.splitTime), splits: s.splits })),
    }
  } else {
    const rounds = buildIndividualRounds(entry, allEntries)
    const fallback: DetailRound = {
      label: res.label ?? "Entry",
      time: res.time,
      status: res.status,
      place: res.place,
      points: res.points,
      podium: podiumPlace != null,
      seedTime: res.seed && res.seed !== "NT" ? res.seed : undefined,
      seedRank: displaySeedRank(entry),
      heat: formatHeatNumber(heat),
      startTime: entry.startTime || undefined,
      lane,
      splits: entryDisplaySplits(entry),
    }
    const detailRounds = rounds.length > 0 ? rounds : [fallback]
    // The header leads with the round of the row opened: the prelims row its prelims swim.
    const prelimsIndex = entry.resultRound === "P" ? detailRounds.findIndex((r) => r.label === "Prelims") : -1
    const headline = prelimsIndex >= 0 ? prelimsIndex : detailRounds.length - 1
    detail = {
      kind: "individual",
      eventNumber: eventNumber || undefined,
      athleteName: entry.athleteName,
      athleteHref: athletePath(athleteRecord?.slug ?? entry.athleteId),
      title: detailTitle,
      subLine: detailRounds[headline].label,
      rounds: detailRounds,
      headline,
    }
  }

  // A coach can remove an individual swim's time (a faulty one): its swim goes, its row stays as NT.
  const roundSwimId =
    entry.swimId ??
    (entry.resultRound === "P"
      ? entry.prelimSwimId
      : entry.resultRound === "F"
        ? entry.finalSwimId
        : entry.resultSwimId)
  const removeTimeSwimId =
    canEdit && meetId && !isRelay && !entry.isRelayLeadoff && res.time ? roundSwimId : undefined
  const removeTime: RemoveTimeAction | undefined = removeTimeSwimId
    ? {
        pending: removingTime,
        error: removeTimeError,
        run: (done) => {
          const who = rosterNameFirstLast(rosterNamePreferred(entry.athleteName))
          const round = res.label === "Prelims" || res.label === "Finals" ? ` ${res.label.toLowerCase()}` : ""
          if (
            !confirm(
              `Remove ${who}'s ${entry.event}${round} time (${res.time})? Its place, points and splits go too; the row stays, marked NT.`
            )
          ) {
            return
          }
          setRemoveTimeError(null)
          startRemoveTime(async () => {
            try {
              await removeMeetSwimTime(removeTimeSwimId)
              done()
            } catch (err) {
              setRemoveTimeError(err instanceof Error ? err.message : "Failed to remove time")
            }
          })
        },
      }
    : undefined

  // Entries are edited from the detail modal's edit button, so the row has no pencil.
  // Only roster-only entries keep a row button (remove), since there is nothing to edit.
  let editor: ReactNode = null
  let removeButton: ReactNode = null
  if (canEdit && meetId) {
    if (isRelay) {
      editor = (
        <EditRelayButton
          meetId={meetId}
          athletes={athletes ?? []}
          entry={entry}
          open={editOpen}
          onOpenChange={setEditOpen}
          hideTrigger
        />
      )
    } else if (isRosterOnlySheetEntry(entry)) {
      removeButton = (
        <RemoveRosterOnlyButton
          meetId={meetId}
          athleteId={entry.athleteId}
          athleteName={entry.athleteName}
        />
      )
    } else if (
      entry.manual &&
      entry.swimId &&
      entry.course &&
      entry.date &&
      entry.timeMs != null &&
      athletes
    ) {
      editor = (
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
          open={editOpen}
          onOpenChange={setEditOpen}
          hideTrigger
        />
      )
    } else if (
      !entry.swimId &&
      (entry.manual === true ||
        editableSeedKeys.has(`${entry.athleteId}|${normalizeEventName(entry.event)}`))
    ) {
      editor = (
        <EditSheetSeedButton
          meetId={meetId}
          athleteId={entry.athleteId}
          athleteName={entry.athleteName}
          event={entry.event}
          seedTime={entry.seedTime}
          timeStatus={entry.timeStatus}
          eventOptions={individualEventOptions}
          open={editOpen}
          onOpenChange={setEditOpen}
          hideTrigger
        />
      )
    }
  }

  // Coaches fill in what no import has given this row's round; imported values always win.
  const heatLaneIdentity =
    canEdit && heatLaneEditable && meetId && canEditHeatLane(entry) ? heatLaneRowIdentity(entry, athleteGenders) : null
  const heatLaneImported = importedRowHeatLane(entry)
  const heatLaneCoach = coachRowHeatLane(entry)
  // A row no import has given a round can take the coach's (they're all on the T round).
  const roundEditable =
    heatLaneIdentity != null &&
    heatLaneSlot(entry) === "T" &&
    rowRoundResult(entry, allEntries, false).label == null
  const canAddHeatLane =
    heatLaneIdentity != null &&
    (HEAT_LANE_EDITS_OVERRIDE_IMPORTS ||
      roundEditable ||
      (["heat", "heatTotal", "lane", "startTime"] as const).some((f) => heatLaneImported[f] == null))
  const heatLaneEdit: HeatLaneEdit | undefined =
    canAddHeatLane && meetId
      ? {
          meetId,
          row: { ...heatLaneIdentity, slot: heatLaneSlot(entry) },
          imported: heatLaneImported,
          coach: heatLaneCoach,
          roundEditable,
          onSaving: onHeatLaneSaving,
        }
      : undefined

  // The athlete's or relay's team by event at a meet split by team ("GOLD"), in a column of its own
  // as wide as the longest team's pill.
  const teamColumn =
    view.teamPill && athleteTeams
      ? {
          pill: <TeamPill team={view.teamPill} tone={view.teamTone} className="" />,
          width: teamPillColumnWidth(Object.values(athleteTeams)),
        }
      : undefined
  // The leg an athlete swam, after the relay's name and styled like a preferred name: "(2nd)".
  const legSuffix =
    view.legNumber != null ? (
      <span className="font-normal text-foreground-secondary"> ({relayLegOrdinal(view.legNumber)})</span>
    ) : null

  return (
    <>
      <SummaryRow
        id={rowAnchors[0]}
        aliasIds={rowAnchors.slice(1)}
        display={display}
        highlighted={mine}
        eventNumber={view.badgeNumber}
        avatar={
          eventView && !isRelay ? (
            <AthleteAvatar image={athleteRecord?.image} name={entry.athleteName} compact={compact} />
          ) : undefined
        }
        label={
          eventView && !isRelay ? (
            <RosterName name={entry.athleteName} />
          ) : legSuffix ? (
            <>
              {view.label}
              {legSuffix}
            </>
          ) : (
            view.label
          )
        }
        shortLabel={
          // "400 Free A" when "400 Free Relay A" doesn't fit on its line; "Tumanova, Katya" for
          // "Tumanova, Ekaterina (Katya)" once any athlete's name would wrap.
          !eventView && isRelay ? (
            legSuffix ? (
              <>
                {relayDisplayName(view.eventName, displayRelayLetter(entry.relayLetter), true, entry.gender)}
                {legSuffix}
              </>
            ) : (
              relayDisplayName(view.eventName, displayRelayLetter(entry.relayLetter), true, entry.gender)
            )
          )
            : eventView && !isRelay && splitRosterName(entry.athleteName).preferred
              ? rosterNamePreferred(entry.athleteName)
              : undefined
        }
        shareShortLabel={eventView && !isRelay}
        sub={sub || undefined}
        team={view.team}
        teamColumn={teamColumn}
        round={view.round}
        heatLane={heatLane}
        startTime={view.startTime}
        legs={legs.map((leg, i) => ({
          tag: legTags?.[i] ?? String(i + 1),
          name: rosterNameFirstLast(rosterNamePreferred(leg.name)),
          split: leg.split,
        }))}
        result={result}
        detail={detail}
        trailing={removeButton}
        onEdit={editor ? () => setEditOpen(true) : undefined}
        editLabel={isRelay ? "Edit relay" : "Edit"}
        heatLaneEdit={heatLaneEdit}
        removeTime={removeTime}
      />
      {editor}
    </>
  )
}

/** The settings menu's flyouts. */
type SettingsSubmenu = "session" | "rounds" | "gender" | "rows" | "show"

const DENSITY_KEY = "swimbuzz-summary-row-density"
const ROWINFO_KEY = "swimbuzz-summary-row-info"
/**
 * Per meet: the view, grouping and filters, kept for a while (not for good) — the fallback when the
 * meet's URL names no view (the URL is where the view lives; see roster-summary-view.ts).
 */
const VIEW_KEY_PREFIX = "swimbuzz-summary-view:"
const VIEW_TTL_MS = 12 * 60 * 60 * 1000

type SavedView = {
  savedAt: number
  viewMode: "summary" | "roster"
  viewByEvent: boolean
  gender: "all" | "F" | "M"
  session: string | null
  hiddenRounds: SummaryRoundKind[]
  mine?: boolean
}

/** The meet's saved view when it's recent and well-formed, else null. */
function readSavedView(key: string): SavedView | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || "null") as Partial<SavedView> | null
    if (!v || typeof v.savedAt !== "number" || Date.now() - v.savedAt > VIEW_TTL_MS) return null
    return {
      savedAt: v.savedAt,
      viewMode: v.viewMode === "roster" ? "roster" : "summary",
      viewByEvent: v.viewByEvent === true,
      gender: v.gender === "F" || v.gender === "M" ? v.gender : "all",
      session: typeof v.session === "string" ? v.session : null,
      hiddenRounds: Array.isArray(v.hiddenRounds)
        ? v.hiddenRounds.filter((k): k is SummaryRoundKind => k === "P" || k === "F" || k === "T")
        : [],
      mine: v.mine === true,
    }
  } catch {
    return null
  }
}

/**
 * The page was opened on one swim or relay (`#swim-<id>` / `#relay-…` from an athlete page or the
 * records' Top 10), which a saved filter could hide.
 */
function linkedToSwim(): boolean {
  return /#(swim|relay)-/.test(window.location.hash)
}

/** A filter that's on, as a removable chip under the toolbar. */
type ActiveFilter = { key: string; label: string; clear: () => void }

const VIEW_OPTIONS: { value: SummaryViewMode; label: string; icon: "user" | "numberedList" | "list" }[] = [
  { value: "athlete", label: "Athletes", icon: "user" },
  { value: "event", label: "Events", icon: "numberedList" },
  { value: "roster", label: "Roster", icon: "list" },
]

/**
 * The summary's three views side by side — by athlete, by event, the roster — as one icon-only
 * segmented control after the search box, styled like the List/Gallery toggle (gold sliding pill)
 * but sized to this toolbar's 38px controls; each view is named in its hover detail.
 */
function SummaryViewSwitch({
  value,
  onChange,
}: {
  value: SummaryViewMode
  onChange: (next: SummaryViewMode) => void
}) {
  const selectedIndex = Math.max(0, VIEW_OPTIONS.findIndex((option) => option.value === value))
  return (
    <SegmentedToggle
      selectedIndex={selectedIndex}
      className="h-[38px] shrink-0 rounded-lg border border-border bg-background"
    >
      {VIEW_OPTIONS.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={"group relative size-7! cursor-pointer " + segmentedIconOptionClass(selected)}
          >
            <LedgerIcon name={option.icon} className="h-4 w-4 shrink-0" />
            <HoverDetail label={option.label} />
          </button>
        )
      })}
    </SegmentedToggle>
  )
}

const toolbarButton =
  "inline-flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill"

export default function MeetSheetSummarySection({
  psychSummary,
  heatSummary,
  finalsHeatSummary,
  entriesSummary,
  results,
  relayResults,
  relayLegSwims = [],
  heatLaneOverrides = null,
  heatLaneEditable = true,
  meetId,
  meetName,
  defaultCourse,
  defaultDate,
  athletes = [],
  rosterAthletes = [],
  canEdit = false,
  viewerAthleteId = null,
  individualEventOptions = [],
  editableSeedKeys = [],
  eventNumberOptions = [],
  eventOrder = null,
  scoreByGender = false,
  details,
  iconUrl = null,
  initialView = DEFAULT_SUMMARY_VIEW,
  viewFromUrl = false,
  athleteTeams = {},
}: {
  psychSummary?: SheetSummary | null
  heatSummary?: SheetSummary | null
  finalsHeatSummary?: SheetSummary | null
  entriesSummary?: SheetSummary | null
  results?: MeetResultEntry[] | null
  relayResults?: SheetSummary["entries"] | null
  /** The meet's relay leadoff and split swims, which open their relays' rows from `#swim-<id>`. */
  relayLegSwims?: RelayLegSwim[]
  /** Meet.heatLaneOverrides — coach heat & lane, shown where no import has it. */
  heatLaneOverrides?: unknown
  /** Coaches can fill in heat & lane until the meet is over. */
  heatLaneEditable?: boolean
  meetId?: string
  meetName?: string
  /** Defaults for the coach "Add swim" dialog. */
  defaultCourse?: string
  defaultDate?: string
  athletes?: AthleteRecord[]
  /** Athletes attending this meet, including roster-only entries. */
  rosterAthletes?: AthleteRecord[]
  canEdit?: boolean
  /** Linked roster athlete for the signed-in user — their rows pin to the top. */
  viewerAthleteId?: string | null
  /** Individual event names from the meet packet (for editing sign-up seeds). */
  individualEventOptions?: string[]
  /** `athleteId|event` keys for sign-up/coach seeds that coaches can edit/delete. */
  editableSeedKeys?: string[]
  /** Meet packet event options used to fill missing event numbers. */
  eventNumberOptions?: MeetSignupEventOption[]
  /** Meet packet order of events, whose sessions ("Sunday Finals") the view can filter to. */
  eventOrder?: MeetSessionOrder | null
  /** Women and men are scored separately, so a combined event still lists as Women's and Men's. */
  scoreByGender?: boolean
  /** Date and location for the PNG export's header. */
  details?: MeetHeaderDetails
  iconUrl?: string | null
  /** The view and filters the page's URL names (server-parsed, so the first paint shows them). */
  initialView?: SummaryViewState
  /** The URL names a view; else the meet's saved view (if recent) is restored after mount. */
  viewFromUrl?: boolean
  /**
   * Each athlete's team ("Gold") at a meet whose results name several of ours — a pill after their
   * name in every view and export. Empty otherwise.
   */
  athleteTeams?: Record<string, string>
}) {
  const editableSeedKeySet = new Set(editableSeedKeys)
  const teamTones = teamPillTones(Object.values(athleteTeams))
  // The roster view's columns: name, then (at a meet split by team) the team pills, events, gender.
  const teamColumnWidth = Object.keys(athleteTeams).length > 0 ? teamPillColumnWidth(Object.values(athleteTeams)) : null
  const rosterColumns = teamColumnWidth
    ? `minmax(0,1fr) calc(${teamColumnWidth.replace("em", "")} * 10px) 96px 72px`
    : "minmax(0,1fr) 96px 72px"
  const [searchQuery, setSearchQuery] = useState(initialView.q)
  const [viewByEvent, setViewByEvent] = useState(initialView.view === "event")
  const [viewMode, setViewMode] = useState<"summary" | "roster">(
    initialView.view === "roster" ? "roster" : "summary"
  )
  const [genderFilter, setGenderFilter] = useState<"all" | "F" | "M">(initialView.gender)
  /** A packet session's label, or null for every session. */
  const [sessionFilter, setSessionFilter] = useState<string | null>(initialView.session)
  const [hiddenRounds, setHiddenRounds] = useState<ReadonlySet<SummaryRoundKind>>(
    () => new Set(initialView.hiddenRounds)
  )
  /** Only the viewer's own events (needs a linked athlete). */
  const [mineOnly, setMineOnly] = useState(initialView.mine)
  const [density, setDensity] = useState<RowDensity>("cozy")
  const [showRound, setShowRound] = useState(true)
  const [showHeatLane, setShowHeatLane] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** The settings menu's open flyout, if any. */
  const [submenu, setSubmenu] = useState<SettingsSubmenu | null>(null)
  const submenuProps = (key: SettingsSubmenu) => ({
    open: submenu === key,
    // A late close from a flyout the pointer left mustn't close the one it moved to.
    onOpenChange: (open: boolean) => setSubmenu((current) => (open ? key : current === key ? null : current)),
  })

  const viewKey = `${VIEW_KEY_PREFIX}${meetId ?? ""}`
  // Saving waits until the saved view is restored, so the defaults don't overwrite it first.
  const [viewRestored, setViewRestored] = useState(false)
  /** Roster mode came from the sign-ups card's "N on roster" link — shown, but not saved for later. */
  const rosterJumpRef = useRef(false)

  useEffect(() => {
    let saved: { density?: RowDensity; round?: boolean; hl?: boolean } = {}
    // The URL's view wins; without one, the saved view — unless the page was opened on one swim,
    // which a saved filter or the roster view would hide (its row opens from the URL hash).
    const view = viewFromUrl || linkedToSwim() ? null : readSavedView(viewKey)
    try {
      const d = window.localStorage.getItem(DENSITY_KEY)
      const info = JSON.parse(window.localStorage.getItem(ROWINFO_KEY) || "null")
      saved = {
        density: d === "cozy" || d === "compact" ? d : undefined,
        round: info ? info.round !== false : undefined,
        hl: info ? info.hl !== false : undefined,
      }
    } catch {}
    const frame = requestAnimationFrame(() => {
      if (saved.density) setDensity(saved.density)
      if (saved.round != null) setShowRound(saved.round)
      if (saved.hl != null) setShowHeatLane(saved.hl)
      if (view) {
        setViewMode(view.viewMode)
        setViewByEvent(view.viewByEvent)
        setGenderFilter(view.gender)
        setSessionFilter(view.session)
        setHiddenRounds(new Set(view.hiddenRounds))
        setMineOnly(view.mine === true)
      }
      setViewRestored(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [viewKey, viewFromUrl])

  // The view lives in the URL (replaced in place: no history entry, no server round trip), so a
  // reload, back/forward or a shared link shows it; the saved copy is only the fallback.
  useEffect(() => {
    if (!viewRestored) return
    const state: SummaryViewState = {
      view: viewMode === "roster" ? "roster" : viewByEvent ? "event" : "athlete",
      gender: genderFilter,
      session: sessionFilter,
      hiddenRounds: [...hiddenRounds],
      mine: mineOnly,
      q: searchQuery,
    }
    const search = summaryViewSearch(state, window.location.search)
    if (search !== window.location.search) {
      window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`)
    }
  }, [viewRestored, viewMode, viewByEvent, genderFilter, sessionFilter, hiddenRounds, mineOnly, searchQuery])

  useEffect(() => {
    if (!viewRestored) return
    if (viewMode !== "roster") rosterJumpRef.current = false
    if (rosterJumpRef.current) return
    const view: SavedView = {
      savedAt: Date.now(),
      viewMode,
      viewByEvent,
      gender: genderFilter,
      session: sessionFilter,
      hiddenRounds: [...hiddenRounds],
      mine: mineOnly,
    }
    try {
      window.localStorage.setItem(viewKey, JSON.stringify(view))
    } catch {}
  }, [viewRestored, viewKey, viewMode, viewByEvent, genderFilter, sessionFilter, hiddenRounds, mineOnly])

  useEscapeToClose(settingsOpen, () => setSettingsOpen(false))

  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const show = () => {
      rosterJumpRef.current = true
      setViewMode("roster")
      setSearchQuery("")
      setGenderFilter("all")
      requestAnimationFrame(() =>
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      )
    }
    window.addEventListener(SHOW_ROSTER_EVENT, show)
    return () => window.removeEventListener(SHOW_ROSTER_EVENT, show)
  }, [])

  function persist(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value)
    } catch {}
  }

  function pickDensity(next: RowDensity) {
    setDensity(next)
    persist(DENSITY_KEY, next)
    setSettingsOpen(false)
  }

  function toggleRowInfo(which: "round" | "hl") {
    const round = which === "round" ? !showRound : showRound
    const hl = which === "hl" ? !showHeatLane : showHeatLane
    setShowRound(round)
    setShowHeatLane(hl)
    persist(ROWINFO_KEY, JSON.stringify({ round, hl }))
  }

  // Points stay off the rows; the swim's detail modal shows them.
  const display: RowDisplay = { density, showRound, showHeatLane }

  const athleteGenders = new Map(
    athletes
      .filter((a): a is typeof a & { gender: "M" | "F" } => a.gender === "M" || a.gender === "F")
      .map((a) => [a.id, a.gender])
  )
  const athleteNames = new Map(athletes.map((a) => [a.id, a.name]))

  // A coach's heat & lane shows at once while it saves; the refreshed page then takes over.
  const [shownHeatLaneOverrides, showHeatLaneSaving] = useOptimistic(
    heatLaneOverrides,
    (current: unknown, input: SetHeatLaneInput) => {
      try {
        const entries = isHeatLaneOverridesSummary(current) ? current.entries : []
        return { entries: upsertHeatLaneOverride(entries, parseSetHeatLaneInput(input)) }
      } catch {
        return current
      }
    }
  )

  // Built and cleaned like mobile's payload (roster-summary-display.ts), so both list the same rows.
  const summarySources = {
    psychSummary,
    heatSummary,
    finalsHeatSummary,
    entriesSummary,
    results,
    relayResults,
    heatLaneOverrides: shownHeatLaneOverrides,
  }
  const summary = buildRosterSummary(summarySources, athleteGenders, athleteNames)
  const relays = summary
    ? attachCoachHeatLanes(uniqueRelayTeams(summary.entries, athleteGenders), shownHeatLaneOverrides, athleteGenders).map(
        applyCoachHeatLane
      )
    : []
  const hasImportedResults = rosterSummaryHasResults(summarySources)
  // A relay leadoff shows on its relay's row (as that athlete's leg 1 split), not as a row of its own.
  const displayEntries = summary
    ? dropSeedOnlyAfterResults(
        expandIndividualResultRows(inferResultHeatTotals(summary.entries)),
        hasImportedResults,
        editableSeedKeySet
      )
        .filter((entry) => !entry.isRelayLeadoff)
        .map(applyCoachHeatLane)
    : []
  // By athlete: each relay sits in the section of every swimmer on it (relay-only swimmers get
  // a section too), so there's no separate relays list.
  const grouped = (() => {
    const byAthlete = new Map<string, { athleteId: string; name: string; entries: SummaryEntry[] }>()
    for (const group of summary ? groupSheetByAthlete(displayEntries, athleteNames) : []) {
      const athleteId = group.entries[0]?.athleteId ?? ""
      byAthlete.set(athleteId, { athleteId, name: group.name, entries: [...group.entries] })
    }
    for (const relay of relays) {
      for (const swimmer of relay.relaySwimmers ?? []) {
        if (!swimmer.athleteId) continue
        let group = byAthlete.get(swimmer.athleteId)
        if (!group) {
          group = {
            athleteId: swimmer.athleteId,
            name: athleteNames.get(swimmer.athleteId) ?? swimmer.name,
            entries: [],
          }
          byAthlete.set(swimmer.athleteId, group)
        }
        if (!group.entries.includes(relay)) group.entries.push(relay)
      }
    }
    return [...byAthlete.values()].sort((a, b) => a.name.localeCompare(b.name))
  })()

  // Sort by the event number each row shows.
  const displayedEventNumber = (entry: SummaryEntry) =>
    resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions)
  const compareByDisplayedEvent = (a: SummaryEntry, b: SummaryEntry) =>
    compareIndividualEntries(
      { ...a, eventNumber: displayedEventNumber(a) },
      { ...b, eventNumber: displayedEventNumber(b) }
    )

  // Relays interleave with individual events in meet order rather than trailing them.
  const compareMyEntries = (a: SummaryEntry, b: SummaryEntry) => {
    if (a.entryType !== "relay_team" || b.entryType !== "relay_team") {
      return compareByDisplayedEvent(a, b)
    }
    const an = displayedEventNumber(a)
    const bn = displayedEventNumber(b)
    if (an !== bn) return an === 0 ? 1 : bn === 0 ? -1 : an - bn
    return compareRelayEvents(a.event, b.event)
  }

  const myIndividualEntries = viewerAthleteId
    ? displayEntries.filter(
        (e) =>
          e.athleteId === viewerAthleteId && e.entryType === "individual"
      )
    : []
  const myRelays = viewerAthleteId
    ? relays.filter((e) => e.relaySwimmers?.some((s) => s.athleteId === viewerAthleteId))
    : []
  const myEntries = [...myIndividualEntries, ...myRelays].sort(compareMyEntries)
  const otherGrouped = viewerAthleteId
    ? grouped.filter((a) => a.athleteId !== viewerAthleteId)
    : grouped

  const q = searchQuery.trim().toLowerCase()
  const sessions = rosterSummarySessions(eventOrder)
  const activeSession = sessionFilter && sessions.includes(sessionFilter) ? sessionFilter : null
  const matchesSessionFilter = (entry: SummaryEntry) =>
    !activeSession ||
    !eventOrder ||
    sessionIncludes(eventOrder, activeSession, {
      eventNumber: displayedEventNumber(entry),
      event: entry.event,
      gender:
        entry.entryType === "relay_team"
          ? effectiveRelayGender(entry, athleteGenders)
          : entry.gender || athleteGenders.get(entry.athleteId),
      rounds: rowSessionRounds(entry, displayEntries),
    })
  // Rounds the summary has rows for; the round filter only shows when there's more than one.
  const presentRounds = new Set(
    [...displayEntries, ...relays].map((entry) => rowRoundKind(entry, displayEntries))
  )
  const availableRounds = SUMMARY_ROUNDS.map((r) => r.kind).filter((kind) => presentRounds.has(kind))
  const roundFilterOn = availableRounds.length > 1
  const matchesRoundFilter = (entry: SummaryEntry) => {
    if (!roundFilterOn) return true
    const kind = rowRoundKind(entry, displayEntries)
    return roundFilterIncludes(hiddenRounds, kind ? [kind] : [], availableRounds)
  }
  const matchesFilters = (entry: SummaryEntry) => {
    if (!matchesSessionFilter(entry) || !matchesRoundFilter(entry)) return false
    if (genderFilter === "all") return true
    if (entry.entryType === "relay_team") {
      const relayGender = effectiveRelayGender(entry, athleteGenders)
      return relayGender === genderFilter || relayGender === "X"
    }
    return (entry.gender ?? athleteGenders.get(entry.athleteId)) === genderFilter
  }
  /** "My events" is on (and means something: the viewer has a linked athlete). */
  const mineActive = mineOnly && Boolean(viewerAthleteId) && viewMode === "summary"
  /** The viewer's own row: their individual swim, or a relay they're on. */
  const isMine = (entry: SummaryEntry) =>
    Boolean(viewerAthleteId) &&
    (entry.entryType === "relay_team"
      ? Boolean(entry.relaySwimmers?.some((s) => s.athleteId === viewerAthleteId))
      : entry.athleteId === viewerAthleteId)
  /**
   * Search under an athlete, alike for the viewer's pinned section and everyone else's: the athlete's
   * name keeps all their rows, else only the rows whose event matches ("Fly" lists fly swims).
   */
  const matchesAthleteSearch = (name: string, entry: SummaryEntry) =>
    !q || name.toLowerCase().includes(q) || entry.event.toLowerCase().includes(q)
  const viewerName = viewerAthleteId ? athleteNames.get(viewerAthleteId) ?? "" : ""
  const filteredMyEntries = myEntries.filter(
    (entry) => matchesFilters(entry) && matchesAthleteSearch(viewerName, entry)
  )
  const filterAthleteGroups = (groups: typeof grouped) =>
    groups
      .map((athleteGroup) => ({
        ...athleteGroup,
        entries: athleteGroup.entries.filter(
          (entry) => matchesFilters(entry) && matchesAthleteSearch(athleteGroup.name, entry)
        ),
      }))
      .filter((athleteGroup) => athleteGroup.entries.length > 0)
  const filteredOtherGrouped = mineActive ? [] : filterAthleteGroups(otherGrouped)

  // For the "by event" view: use the de-duped relay list (the same relays the by-athlete sections use)
  // so that seed rows from the heat sheet don't appear as duplicates alongside result rows. Roster-only
  // "Attending" rows aren't an event, so they stay out of it (the Roster view lists who's attending).
  const deduplicatedByEventEntries: SummaryEntry[] = [
    ...displayEntries.filter((entry) => entry.entryType !== "relay_team" && !entry.rosterOnly),
    ...relays,
  ].filter((entry) => matchesFilters(entry) && (!mineActive || isMine(entry)))

  const rawGroupedEvents = deduplicatedByEventEntries.reduce((acc, entry) => {
    const gender =
      entry.entryType === "relay_team"
        ? effectiveRelayGender(entry, athleteGenders) || entry.gender || "U"
        : !scoreByGender && isMixedIndividualEvent(entry.event, eventNumberOptions)
          ? "X"
          : entry.gender || athleteGenders.get(entry.athleteId) || "U"
    const eventNumber = resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions)
    const title = `${eventGenderWord(gender) ?? ""} ${entry.event}`.trim()
    // Use the eventNumber, gender, and event name for unique grouping
    const key = `${eventNumber}|${title}`
    if (!acc.has(key)) {
      acc.set(key, { key, title, eventNumber, gender, entries: [] })
    }
    acc.get(key)!.entries.push(entry)
    return acc
  }, new Map<string, { key: string; title: string; eventNumber: number; gender: string; entries: SummaryEntry[] }>())

  // Placeholder counts follow the gender, session and round filters but not the search query.
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`
  // The filters in effect, after the counts: " in Sunday Finals (Women)".
  const genderSuffix = genderFilter === "all" ? "" : ` (${genderFilter === "F" ? "Women" : "Men"})`
  const scope = rosterSummaryScopeLabel(
    activeSession,
    roundFilterOn ? roundFilterLabel(hiddenRounds, availableRounds) : null
  )
  const searchPlaceholder =
    viewMode === "roster"
      ? `Search ${plural(
          rosterAthletes.filter((a) => genderFilter === "all" || a.gender === genderFilter).length,
          "athlete"
        )}${genderSuffix}…`
      : `Search ${plural(
          grouped.filter((g) => g.entries.some(matchesFilters)).length,
          "athlete"
        )} and ${plural(
          [...rawGroupedEvents.values()].filter((g) => g.entries.some(matchesFilters)).length,
          "event"
        )}${scope ? ` in ${scope}` : ""}${genderSuffix}…`

  const sortedEventGroups = [...rawGroupedEvents.values()]
    .filter((group) => {
      if (!q) return true
      const header = `${group.eventNumber > 0 ? `#${group.eventNumber} ` : ""}${group.title}`
      return (
        header.toLowerCase().includes(q) ||
        group.entries.some(
          (e) =>
            (e.athleteName ?? "").toLowerCase().includes(q) ||
            e.relaySwimmers?.some((s) => s.name.toLowerCase().includes(q))
        )
      )
    })
    .sort((a, b) => {
      // Sort numerically by eventNumber, then alphabetically by title
      if (a.eventNumber !== b.eventNumber) {
        if (a.eventNumber === 0) return 1
        if (b.eventNumber === 0) return -1
        return a.eventNumber - b.eventNumber
      }
      // Women before men under the same event number (a mixed event scored by gender).
      return genderOrder(a.gender) - genderOrder(b.gender) || a.title.localeCompare(b.title)
    })

  const hasSummaryContent =
    filteredMyEntries.length > 0 || filteredOtherGrouped.length > 0
  const filteredRosterAthletes = rosterAthletes.filter(
    (athlete) =>
      (genderFilter === "all" || athlete.gender === genderFilter) &&
      (!q || athlete.name.toLowerCase().includes(q))
  )
  // Viewer's own row pins to the top; everyone else keeps roster order.
  filteredRosterAthletes.sort(
    (a, b) => Number(b.id === viewerAthleteId) - Number(a.id === viewerAthleteId)
  )
  const hasContent =
    viewMode === "roster"
      ? filteredRosterAthletes.length > 0
      : viewByEvent
        ? sortedEventGroups.length > 0
        : hasSummaryContent

  // Jump rail (JumpRail) down the side: by athlete and in the roster A–Z, each letter pointing at
  // the first card/row whose name starts with it (the viewer's own, pinned at the top, aside); by
  // event a number per numbered event listed. `jumpIds`: card/row key → id.
  const jumpIds = new Map<string, string>()
  const railItems: JumpRailItem[] = []
  if (hasContent) {
    const prefix = viewMode === "roster" ? "roster" : viewByEvent ? "event" : "athlete"
    const cardId = (cardKey: string) =>
      `summary-jump-${prefix}-${cardKey}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
    if (viewMode === "summary" && viewByEvent) {
      for (const group of sortedEventGroups) {
        if (group.eventNumber <= 0) continue
        const number = String(group.eventNumber)
        if (railItems.some((item) => item.key === number)) continue
        const targetId = cardId(group.key)
        jumpIds.set(group.key, targetId)
        railItems.push({
          key: number,
          label: number,
          ariaLabel: `Event ${number}, ${group.title}`,
          hoverLabel: group.title,
          targetId,
        })
      }
    } else {
      // "Last, First" → "A"–"Z", or "#" when it doesn't start with a letter.
      const named =
        viewMode === "roster"
          ? filteredRosterAthletes
              .filter((athlete) => athlete.id !== viewerAthleteId)
              .map((athlete) => ({ key: athlete.id, name: athlete.name }))
          : filteredOtherGrouped.map((group) => ({ key: group.athleteId, name: group.name }))
      const letterTargets = new Map<string, string>()
      for (const { key, name } of named) {
        const first = name.trim().charAt(0).toUpperCase()
        const letter = /[A-Z]/.test(first) ? first : "#"
        if (letterTargets.has(letter)) continue
        const targetId = cardId(key)
        jumpIds.set(key, targetId)
        letterTargets.set(letter, targetId)
      }
      const letters = letterTargets.has("#") ? [...JUMP_RAIL_LETTERS, "#"] : JUMP_RAIL_LETTERS
      for (const letter of letters) {
        railItems.push({
          key: letter,
          label: letter,
          ariaLabel: letter === "#" ? "Other athletes" : `Athletes starting with ${letter}`,
          targetId: letterTargets.get(letter),
        })
      }
    }
  }

  const eventCountByAthlete = new Map<string, number>()
  for (const entry of displayEntries) {
    if (entry.entryType === "relay_team" || entry.rosterOnly) continue
    eventCountByAthlete.set(entry.athleteId, (eventCountByAthlete.get(entry.athleteId) ?? 0) + 1)
  }
  for (const relay of relays) {
    for (const swimmer of relay.relaySwimmers ?? []) {
      if (!swimmer.athleteId) continue
      eventCountByAthlete.set(swimmer.athleteId, (eventCountByAthlete.get(swimmer.athleteId) ?? 0) + 1)
    }
  }

  const rowProps = {
    display,
    canEdit,
    meetId,
    meetName,
    athletes,
    athleteGenders,
    allEntries: displayEntries,
    individualEventOptions,
    editableSeedKeys: editableSeedKeySet,
    eventNumberOptions,
    onHeatLaneSaving: showHeatLaneSaving,
    heatLaneEditable,
    relayLegSwims,
    athleteTeams,
    teamTones,
  }

  const viewerRecord = viewerAthleteId ? athletes.find((a) => a.id === viewerAthleteId) : undefined
  const addMenuVisible = canEdit && meetId

  const currentView: SummaryViewMode = viewMode === "roster" ? "roster" : viewByEvent ? "event" : "athlete"
  function pickView(next: SummaryViewMode) {
    setViewMode(next === "roster" ? "roster" : "summary")
    if (next !== "roster") setViewByEvent(next === "event")
  }

  // The filters in effect, as chips under the toolbar (the ones the view in use applies).
  // One chip per shown round, each hiding just its own.
  const roundChips = roundFilterOn ? roundFilterChips(hiddenRounds, availableRounds) : []
  const activeFilters: ActiveFilter[] = [
    ...(mineActive ? [{ key: "mine", label: "My events", clear: () => setMineOnly(false) }] : []),
    ...(viewMode === "summary" && activeSession
      ? [{ key: "session", label: activeSession, clear: () => setSessionFilter(null) }]
      : []),
    ...(viewMode === "summary"
      ? roundChips.map((chip) => ({
          key: `round-${chip.kind ?? "none"}`,
          label: chip.label,
          clear: () => setHiddenRounds(chip.hide),
        }))
      : []),
    ...(genderFilter !== "all"
      ? [{ key: "gender", label: genderFilter === "F" ? "Women" : "Men", clear: () => setGenderFilter("all") }]
      : []),
  ]
  function clearFilters() {
    setMineOnly(false)
    setSessionFilter(null)
    setHiddenRounds(new Set())
    setGenderFilter("all")
  }

  /**
   * The view as it's shown — same mode, filters, search, order and row toggles — for the PDF export,
   * minus the viewer's pinned section: they're listed in their usual place like everyone else.
   */
  function buildPdfRequest(): RosterSummaryPdfRequest {
    const rowCtx = { athleteGenders, allEntries: displayEntries, eventNumberOptions, athleteTeams, teamTones }
    const toRow = (entry: SummaryEntry, eventView = false, athleteId?: string, showRound = display.showRound) =>
      summaryRowPdf(entry, rowCtx, { ...display, showRound }, eventView, athleteId)
    // "Entries" → "Heats" once a heat sheet is in → "Results" once results are posted.
    const title = rosterSummaryTitle({
      hasHeatSheet: Boolean(heatSummary || finalsHeatSummary),
      hasResults: hasImportedResults,
    })
    // "Heats by Event · Sunday Finals · Women".
    const heading = [
      viewMode === "roster" ? "Roster" : `${title} by ${viewByEvent ? "Event" : "Athlete"}`,
      viewMode === "summary" ? scope : null,
      genderFilter === "F" ? "Women" : genderFilter === "M" ? "Men" : null,
      mineActive ? "My events" : null,
      q ? `“${searchQuery.trim()}”` : null,
    ]
      .filter(Boolean)
      .join(" · ")
    // Entries and Heats exports lead with the order of events (the session's, when filtered to one).
    const orderOfEvents =
      viewMode === "summary" && title !== "Results" && eventOrder?.sessions.length
        ? { orderOfEvents: { session: activeSession ?? undefined } }
        : {}

    let sections: RosterSummaryPdfSection[] = []
    if (!hasContent) return { heading, sections, ...orderOfEvents }
    if (viewMode === "roster") {
      // Roster order, without pinning the viewer to the top.
      const athletesInOrder = rosterAthletes.filter((athlete) => filteredRosterAthletes.includes(athlete))
      const rows: RosterSummaryPdfRow[] = athletesInOrder.map((athlete) => {
        const count = eventCountByAthlete.get(athlete.id) ?? 0
        const gender = athlete.gender === "F" ? "Women" : athlete.gender === "M" ? "Men" : ""
        const badges = [
          athlete.missingSwimCloud ? "No SwimCloud" : null,
          athlete.timesNeverImported ? "Never imported" : null,
        ].filter(Boolean)
        return {
          label: athlete.name,
          team: athleteTeams[athlete.id],
          teamTone: teamTones[athleteTeams[athlete.id] ?? ""],
          sub: badges.join(" · ") || undefined,
          result: {
            kind: "text",
            text: [`${count} event${count === 1 ? "" : "s"}`, gender].filter(Boolean).join(" · "),
          },
        }
      })
      sections = [
        {
          title: `${filteredRosterAthletes.length} athlete${filteredRosterAthletes.length === 1 ? "" : "s"}`,
          rows,
        },
      ]
    } else if (viewByEvent) {
      sections = sortedEventGroups.map((group) => {
        const entries = sortEventEntries(group.entries, displayEntries)
        const rounds = entriesByRound(entries, displayEntries)
        const section = {
          title: group.title,
          eventNumber: group.eventNumber > 0 ? group.eventNumber : undefined,
        }
        // A timed final names its round once beside the title (when rounds are shown).
        if (rounds?.length === 1 && rounds[0].kind === "T") {
          return {
            ...section,
            sub: display.showRound ? EXPORT_ROUND_LABELS[rounds[0].kind] : undefined,
            rows: entries.map((entry) => toRow(entry, true, undefined, false)),
          }
        }
        // Prelims and finals each go under their own subheading — even when only one of them is
        // listed — which then names the round in place of its rows.
        return {
          ...section,
          rows: rounds
            ? rounds.flatMap(({ kind, entries }) => [
                { label: EXPORT_ROUND_LABELS[kind], subheading: true },
                ...entries.map((entry) => toRow(entry, true, undefined, false)),
              ])
            : entries.map((entry) => toRow(entry, true)),
        }
      })
      return { heading, sections, splitSections: true, ...orderOfEvents }
    } else {
      const exported = filterAthleteGroups(grouped).filter(
        (athleteGroup) => !mineActive || athleteGroup.athleteId === viewerAthleteId
      )
      for (const athleteGroup of exported) {
        sections.push({
          title: athleteGroup.name,
          team: athleteTeams[athleteGroup.athleteId],
          teamTone: teamTones[athleteTeams[athleteGroup.athleteId] ?? ""],
          // Under an athlete, a relay is just the event — no list of its swimmers.
          rows: [...athleteGroup.entries]
            .sort(compareMyEntries)
            .map((entry) => ({
              ...toRow(entry, false, athleteGroup.athleteId),
              legs: undefined,
              legSplits: undefined,
              legSubSplits: undefined,
            })),
        })
      }
    }
    return { heading, sections, ...orderOfEvents }
  }

  return (
    // Every row of the summary lays out alike, however much room its own label needs.
    <SummaryRowFold>
      <section ref={sectionRef} className="@container/summary scroll-mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 pb-1">
          <input
            type="search"
            aria-label={viewMode === "roster" ? "Search athletes" : "Search athletes or events"}
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-[38px] min-w-0 flex-1 basis-32 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/35"
          />

          <SummaryViewSwitch value={currentView} onChange={pickView} />

          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Filters and display"
              title="Filters and display"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              onClick={() => {
                setSettingsOpen(!settingsOpen)
                setSubmenu(null)
              }}
              className={`${toolbarButton} ${activeFilters.length > 0 ? "text-accent" : ""}`}
            >
              <LedgerIcon name="settings" className="h-[18px] w-[18px] shrink-0" />
            </button>
            {settingsOpen ? (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} />
                <div role="menu" className={menuPanel}>
                  {viewMode === "summary" && viewerAthleteId ? (
                    <MenuItem
                      role="menuitemcheckbox"
                      icon="user"
                      label="My events only"
                      selected={mineOnly}
                      onClick={() => {
                        setMineOnly((on) => !on)
                        setSettingsOpen(false)
                      }}
                    />
                  ) : null}
                  {viewMode === "summary" && sessions.length > 0 ? (
                    <MenuSubmenu
                      icon="calendar"
                      label="Session"
                      value={activeSession ?? "All"}
                      active={activeSession != null}
                      {...submenuProps("session")}
                    >
                      {[null, ...sessions].map((session) => (
                        <MenuItem
                          key={session ?? "all"}
                          icon="calendar"
                          label={session ?? "All sessions"}
                          selected={activeSession === session}
                          onClick={() => {
                            setSessionFilter(session)
                            setSettingsOpen(false)
                          }}
                        />
                      ))}
                    </MenuSubmenu>
                  ) : null}
                  {viewMode === "summary" && roundFilterOn ? (
                    <MenuSubmenu
                      icon="flag"
                      label="Rounds"
                      value={roundFilterLabel(hiddenRounds, availableRounds) ?? "All"}
                      active={roundFilterLabel(hiddenRounds, availableRounds) != null}
                      {...submenuProps("rounds")}
                    >
                      {SUMMARY_ROUNDS.filter((r) => availableRounds.includes(r.kind)).map((r) => (
                        <MenuItem
                          key={r.kind}
                          role="menuitemcheckbox"
                          icon="flag"
                          label={r.label}
                          selected={!hiddenRounds.has(r.kind)}
                          onClick={() =>
                            setHiddenRounds((hidden) => {
                              const next = new Set(hidden)
                              if (next.has(r.kind)) next.delete(r.kind)
                              else next.add(r.kind)
                              return next
                            })
                          }
                        />
                      ))}
                    </MenuSubmenu>
                  ) : null}
                  <MenuSubmenu
                    icon="users"
                    label="Gender"
                    value={genderFilter === "F" ? "Women" : genderFilter === "M" ? "Men" : "All"}
                    active={genderFilter !== "all"}
                    {...submenuProps("gender")}
                  >
                    {(
                      [
                        { value: "all", label: "All", icon: "users" },
                        { value: "F", label: "Women", icon: "user" },
                        { value: "M", label: "Men", icon: "user" },
                      ] as const
                    ).map((g) => (
                      <MenuItem
                        key={g.value}
                        icon={g.icon}
                        label={g.label}
                        selected={genderFilter === g.value}
                        onClick={() => {
                          setGenderFilter(g.value)
                          setSettingsOpen(false)
                        }}
                      />
                    ))}
                  </MenuSubmenu>
                  <MenuDivider />
                  <MenuSubmenu
                    icon={density === "cozy" ? "rowsCozy" : "rowsCompact"}
                    label="Rows"
                    value={density === "cozy" ? "Cozy" : "Compact"}
                    {...submenuProps("rows")}
                  >
                    <MenuItem
                      icon="rowsCozy"
                      label="Cozy rows"
                      selected={density === "cozy"}
                      onClick={() => pickDensity("cozy")}
                    />
                    <MenuItem
                      icon="rowsCompact"
                      label="Compact rows"
                      selected={density === "compact"}
                      onClick={() => pickDensity("compact")}
                    />
                  </MenuSubmenu>
                  <MenuSubmenu
                    icon="lanes"
                    label="Show"
                    value={
                      showRound && showHeatLane
                        ? "All"
                        : showRound
                          ? "Round"
                          : showHeatLane
                            ? "Heat & lane"
                            : "None"
                    }
                    {...submenuProps("show")}
                  >
                    <MenuItem
                      role="menuitemcheckbox"
                      icon="flag"
                      label="Round"
                      selected={showRound}
                      onClick={() => toggleRowInfo("round")}
                    />
                    <MenuItem
                      role="menuitemcheckbox"
                      icon="lanes"
                      label="Heat & lane"
                      selected={showHeatLane}
                      onClick={() => toggleRowInfo("hl")}
                    />
                  </MenuSubmenu>
                </div>
              </>
            ) : null}
          </div>

          {meetId ? (
            <ShareRosterSummaryButton
              meetId={meetId}
              meetName={meetName ?? ""}
              details={details ?? { date: "", location: null, unofficial: false }}
              iconUrl={iconUrl}
              buildRequest={buildPdfRequest}
              onOpen={() => setSettingsOpen(false)}
            />
          ) : null}

          {addMenuVisible ? (
            <MeetAddMenu
              meetId={meetId}
              meetName={meetName ?? ""}
              defaultCourse={defaultCourse ?? "SCY"}
              defaultDate={defaultDate ?? ""}
              athletes={athletes}
              rosterSummaryEntries={entriesSummary?.entries ?? []}
              onOpen={() => setSettingsOpen(false)}
            />
          ) : null}
        </div>

        {activeFilters.length > 0 ? (
          <div role="group" aria-label="Filters on" className="mb-3 flex flex-wrap items-center gap-1.5">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={filter.clear}
                aria-label={`Remove filter: ${filter.label}`}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-accent/45 bg-accent/10 pl-2.5 pr-2 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
              >
                {filter.label}
                <span aria-hidden className="text-sm leading-none">
                  ×
                </span>
              </button>
            ))}
            {activeFilters.length > 1 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="h-7 cursor-pointer px-1.5 text-xs font-medium text-foreground-secondary transition-colors hover:text-primary"
              >
                Clear all
              </button>
            ) : null}
          </div>
        ) : null}

        {!hasContent ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background px-4 py-10 text-center text-sm text-foreground-secondary">
            <span>
              {viewMode === "roster"
                ? "No athletes on the roster match these filters."
                : mineActive && !q
                  ? "You have no events here with these filters."
                  : "No entries match these filters."}
            </span>
            {activeFilters.length > 0 || q ? (
              <button
                type="button"
                onClick={() => {
                  clearFilters()
                  setSearchQuery("")
                }}
                className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-background-hover"
              >
                {q ? "Clear search and filters" : "Clear filters"}
              </button>
            ) : null}
          </div>
        ) : (
          // The jump rail sits beside the cards, or out in the page's right margin when it's wide
          // enough (see JumpRail).
          <div className={JUMP_RAIL_LAYOUT_CLASS}>
            <div className="min-w-0 flex-1">
              {viewMode === "roster" ? (
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <div className="py-2.5 text-sm font-medium text-foreground" style={summaryHeaderInset}>
                    {filteredRosterAthletes.length} athlete{filteredRosterAthletes.length === 1 ? "" : "s"}
                  </div>
                  <ul>
                    {filteredRosterAthletes.map((athlete) => {
                      const isMe = athlete.id === viewerAthleteId
                      const count = eventCountByAthlete.get(athlete.id) ?? 0
                      return (
                        <li key={athlete.id} id={jumpIds.get(athlete.id)} className="scroll-mt-3 border-t border-border">
                          <Link
                            href={athletePath(athlete.slug ?? athlete.id)}
                            className={`grid items-center px-4 py-3 text-sm text-foreground transition-colors duration-200 hover:bg-background-hover ${
                              isMe ? "bg-accent/5" : ""
                            }`}
                            // At a meet split by team, the team pills get a column of their own.
                            style={{ gridTemplateColumns: rosterColumns }}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <AthleteAvatar image={athlete.image} name={athlete.name} />
                              <span className={`truncate font-medium ${isMe ? "text-accent" : ""}`}>
                                <RosterName name={athlete.name} />
                              </span>
                              {athlete.missingSwimCloud ? (
                                <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
                                  No SwimCloud
                                </span>
                              ) : null}
                              {athlete.timesNeverImported ? (
                                <span className="shrink-0 rounded-full bg-fill px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground-secondary">
                                  Never imported
                                </span>
                              ) : null}
                            </span>
                            {teamColumnWidth ? (
                              <span className="flex items-center text-[10px]">
                                {athleteTeams[athlete.id] ? (
                                  <TeamPill
                                    team={athleteTeams[athlete.id]}
                                    tone={teamTones[athleteTeams[athlete.id]]}
                                    className=""
                                  />
                                ) : null}
                              </span>
                            ) : null}
                            <span className="text-right text-xs text-foreground-secondary">
                              {count} event{count === 1 ? "" : "s"}
                            </span>
                            <span className="text-right text-xs text-foreground-secondary">
                              {athlete.gender === "F" ? "Women" : athlete.gender === "M" ? "Men" : ""}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : viewByEvent ? (
                <div className="flex flex-col gap-4">
                  {sortedEventGroups.map((group) => (
                    <div
                      key={group.key}
                      id={jumpIds.get(group.key)}
                      className="scroll-mt-3 overflow-hidden rounded-xl border border-border-secondary bg-background"
                    >
                      <div
                        className="flex items-center gap-2.5 py-2.5 text-sm font-medium text-foreground"
                        style={summaryHeaderInset}
                      >
                        {group.eventNumber > 0 ? (
                          <EventBadge number={group.eventNumber} compact={false} />
                        ) : null}
                        <span>{group.title}</span>
                      </div>
                      <ul className="border-t border-border-subtle">
                        {sortEventEntries(group.entries, displayEntries).map((entry, j) => (
                          <SummaryEntryRow
                            key={`event-${entryRowKey(entry, j, athleteGenders)}`}
                            entry={entry}
                            eventView
                            mine={isMine(entry)}
                            {...rowProps}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredMyEntries.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-primary bg-background shadow-sm">
                      {/* Tint layered over the opaque base so the meet background doesn't show through;
                          `--row-hover` keeps the tint in the rows' hover wash. */}
                      <div className="bg-accent/[0.04] [--row-hover:color-mix(in_oklab,var(--color-accent)_4%,var(--color-background-hover))]">
                        <Link
                          href={athletePath(viewerRecord?.slug ?? viewerAthleteId!)}
                          className="flex items-center gap-2 py-2 text-sm font-medium text-accent transition-colors duration-200 hover:bg-[var(--row-hover,var(--color-background-hover))]"
                          style={summaryHeaderInset}
                        >
                          <AthleteAvatar
                            image={viewerRecord?.image}
                            name={athleteNames.get(viewerAthleteId!) || "My Profile"}
                          />
                          <span>
                            <RosterName name={athleteNames.get(viewerAthleteId!) ?? ""} />
                            {athleteTeams[viewerAthleteId!] ? (
                              <TeamPill
                                team={athleteTeams[viewerAthleteId!]}
                                tone={teamTones[athleteTeams[viewerAthleteId!]]}
                              />
                            ) : null}
                          </span>
                        </Link>
                        <ul className="border-t border-border-subtle">
                          {filteredMyEntries.map((entry, i) => (
                            <SummaryEntryRow
                              key={`mine-${entryRowKey(entry, i, athleteGenders)}`}
                              entry={entry}
                              athleteId={viewerAthleteId ?? undefined}
                              {...rowProps}
                            />
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                  {filteredOtherGrouped.map((athleteGroup) => {
                    const events = [...athleteGroup.entries].sort(compareMyEntries)
                    const athleteData = athletes.find((a) => a.id === athleteGroup.athleteId)
                    return (
                      <div
                        key={athleteGroup.athleteId}
                        id={jumpIds.get(athleteGroup.athleteId)}
                        className="scroll-mt-3 overflow-hidden rounded-xl border border-border bg-background"
                      >
                        <Link
                          href={athletePath(athleteData?.slug ?? athleteGroup.athleteId)}
                          className="flex items-center gap-2 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background-hover"
                          style={summaryHeaderInset}
                        >
                          <AthleteAvatar image={athleteData?.image} name={athleteGroup.name} />
                          <span>
                            <RosterName name={athleteGroup.name} />
                            {athleteTeams[athleteGroup.athleteId] ? (
                              <TeamPill
                                team={athleteTeams[athleteGroup.athleteId]}
                                tone={teamTones[athleteTeams[athleteGroup.athleteId]]}
                              />
                            ) : null}
                          </span>
                        </Link>
                        <ul className="border-t border-border-subtle">
                          {events.map((entry, i) => (
                            <SummaryEntryRow
                              key={`${athleteGroup.athleteId}-${entryRowKey(entry, i, athleteGenders)}`}
                              entry={entry}
                              athleteId={athleteGroup.athleteId}
                              {...rowProps}
                            />
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <JumpRail
              label={viewMode === "summary" && viewByEvent ? "Jump to event" : "Jump to athletes by letter"}
              items={railItems}
            />
          </div>
        )}
      </section>
    </SummaryRowFold>
  )
}

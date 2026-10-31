"use client"

import { useEffect, useRef, useState, Fragment, type ReactNode } from "react"
import Link from "next/link"
import {
  eventGenderWord,
  rosterSummaryTitle,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfRow,
  type RosterSummaryPdfSection,
} from "@swimbuzz/shared"
import type { MeetResultEntry, SheetEntry, SheetSummary } from "@/lib/meet/meet-sheet-summary"
import {
  applyRosterNames,
  compareIndividualEntries,
  dropSeedOnlyAfterResults,
  displaySeedRank,
  finalsSeedRank,
  entryDisplaySplits,
  expandIndividualResultRows,
  groupSheetByAthlete,
  inferResultHeatTotals,
  isTimedFinalsEntry,
  isTimedFinalsRound,
  mergeSheetSummaries,
  uniqueRelayTeams,
} from "@/lib/meet/meet-sheet-summary"
import { canonicalizeStrokeEvent, compareRelayEvents, normalizeEventName } from "@/lib/swim/swim-parse"
import {
  eventNumberForGender,
  isRosterOnlySheetEntry,
  type MeetSignupEventOption,
} from "@/lib/meet/meet-signup"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  relayTeamPlace,
  relayTeamTime,
  relayCoachIncompleteNote,
  sanitizeRelaySplitTime,
} from "@/lib/meet/relay-results"
import { displayMeetResultTags } from "@/lib/swim/swim-tags"
import { formatDisplayTime, formatSeedTimeDelta, parseTime } from "@/lib/utils"
import { athletePath } from "@/lib/slug"
import { LedgerIcon } from "@/components/meet/Ledger"
import RosterName from "@/components/athlete/RosterName"
import EditMeetSwimButton from "./EditMeetSwimButton"
import EditSheetSeedButton from "./EditSheetSeedButton"
import RemoveRosterOnlyButton from "./RemoveRosterOnlyButton"
import { EditRelayButton } from "./MeetRelayEditor"
import MeetAddMenu from "./MeetAddMenu"
import ShareRosterSummaryButton from "./ShareRosterSummaryButton"
import { MenuDivider, MenuItem, menuPanel } from "./MeetMenu"
import SummaryRow, { EventBadge, type RowDisplay, type RowDensity, type RowResult } from "./SummaryRow"
import type { DetailRound, SwimDetail } from "./SwimDetailModal"
import { useEscapeToClose } from "@/lib/use-escape-to-close"

function formatHeat(entry: SheetSummary["entries"][number]) {
  // Alternates are finals-only; prelim rows may still carry the flag from merge.
  if (entry.alternate && entry.resultRound !== "P") {
    const rank = displaySeedRank(entry)
    return rank != null ? `Alt ${rank}` : "Alt"
  }
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
  return `${entry.event}-${entry.eventNumber}-${entry.entryType}-${gender}-${entry.relayLetter ?? ""}-${entry.relayRound ?? ""}-${entry.resultRound ?? ""}-${entry.relayLeadoffSource ?? ""}-${entry.relayLeadoffRound ?? ""}-${entry.isRelayLeadoff ? "leadoff" : ""}${athleteKey}-${i}`
}

function resolveDisplayEventNumber(
  entry: SummaryEntry,
  athleteGenders?: Map<string, "M" | "F">,
  eventOptions?: MeetSignupEventOption[]
): number {
  if (entry.eventNumber > 0) return entry.eventNumber
  if (!eventOptions?.length) return 0
  // Packet names spell strokes out ("50 Butterfly"); results use "50 Fly".
  const key = canonicalizeStrokeEvent(entry.event)
  const opt = eventOptions.find((o) => canonicalizeStrokeEvent(o.event) === key)
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

type RoundResult = {
  label: string | null
  time?: string
  status?: string
  place?: number
  seed?: string
}

function pendingRoundLabel(entry: SummaryEntry): string | null {
  if (entry.entryType === "relay_team") {
    const round = effectiveRelayRound(entry)
    if (round === "P") return "Prelims"
    if (round === "F") return "Finals"
  } else {
    if (entry.resultRound === "P") return "Prelims"
    if (entry.resultRound === "F") return "Finals"
  }
  return isTimedFinalsRound(entry.round) ? "Timed Finals" : null
}

/** The single round a summary row represents: its time/status, place and the seed it's measured against. */
function rowRoundResult(entry: SummaryEntry, allEntries?: SummaryEntry[]): RoundResult {
  const timedOpts = allEntries ? { allEntries } : undefined
  const nt = entry.timeStatus === "NT" ? "NT" : undefined

  if (entry.isSwimOff) {
    return { label: "Swim-off", time: entry.resultTime, status: entry.resultStatus, place: entry.resultPlace }
  }

  if (entry.entryType === "relay_team") {
    const round = effectiveRelayRound(entry)
    const time = relayTeamTime(entry) ?? undefined
    const seed =
      round === "F" ? entry.finalsSheetSeedTime : entry.seedTime || entry.prelimTime || nt
    const label =
      round === "P"
        ? "Prelims"
        : round === "F"
          ? "Finals"
          : time
            ? isTimedFinalsEntry(entry)
              ? "Timed Finals"
              : "Finals"
            : pendingRoundLabel(entry)
    return { label, time, place: time ? relayTeamPlace(entry) : undefined, seed }
  }

  if (entry.resultRound === "P") {
    return {
      label: "Prelims",
      time: entry.prelimTime,
      status: entry.prelimStatus,
      place: entry.prelimPlace,
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
        seed,
      }
    }
    return { label: "Finals", time: entry.finalTime, status: finalStatus, place: entry.finalPlace, seed }
  }

  const seed = entry.seedTime || entry.prelimTime || nt
  const timed = isTimedFinalsEntry(entry, timedOpts)
  if (entry.finalTime || finalStatus) {
    return {
      label: timed ? "Timed Finals" : "Finals",
      time: entry.finalTime,
      status: finalStatus,
      place: entry.finalPlace,
      seed,
    }
  }
  if (entry.prelimTime || entry.prelimStatus) {
    return {
      label: "Prelims",
      time: entry.prelimTime,
      status: entry.prelimStatus,
      place: entry.prelimPlace,
      seed,
    }
  }
  if (entry.resultTime || entry.resultStatus) {
    return {
      label: timed ? "Timed Finals" : "Finals",
      time: entry.resultTime,
      status: entry.resultStatus,
      place: entry.resultPlace,
      seed,
    }
  }
  return { label: pendingRoundLabel(entry), seed: seed || entry.timeStatus }
}

function buildIndividualRounds(entry: SheetEntry, allEntries?: SummaryEntry[]): DetailRound[] {
  if (entry.entryType === "relay_team") return []

  if (entry.isSwimOff) {
    return [
      {
        label: "Swim-off",
        time: entry.resultTime,
        place: entry.resultPlace,
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
      status: entry.prelimStatus,
      heat: prelimHeat,
      lane: entry.prelimLane ?? (entry.resultRound === "P" ? individualLane(entry) : undefined),
      splits: entry.prelimSplits ?? (entry.resultRound === "P" ? entry.splits : undefined) ?? [],
      seedTime: entry.seedTime,
      seedRank: entry.seedRank,
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
      podium: true,
      status: entry.finalStatus === "NS" ? undefined : entry.finalStatus,
      heat: finalHeat,
      lane: entry.finalLane,
      splits: entry.finalSplits ?? (entry.resultRound === "F" ? entry.splits : undefined) ?? [],
      seedTime: timed ? entry.seedTime : entry.finalsSheetSeedTime,
      seedRank: timed ? entry.seedRank : finalsSeedRank(entry),
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
      podium: true,
      status: entry.resultStatus,
      heat: formatHeatNumber(formatHeat(entry)),
      lane: individualLane(entry),
      splits: entryDisplaySplits(entry),
      seedTime: entry.seedTime,
      seedRank: entry.seedRank,
    })
  }

  // The entry carries one heat start time; with both rounds shown, it only goes on the
  // round this row is known to be.
  const startTime = entry.startTime || undefined
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

function getEntryPlace(entry: SheetEntry): number | undefined {
  return entry.resultPlace ?? entry.finalPlace ?? entry.prelimPlace
}

function compareByPlace(a: SummaryEntry, b: SummaryEntry, hasResults: boolean): number {
  const placeA = getEntryPlace(a)
  const placeB = getEntryPlace(b)

  if (hasResults) {
    const pA = placeA ?? Infinity
    const pB = placeB ?? Infinity
    if (pA !== pB) return pA - pB
  } else {
    // 1. Sort by seedTime fastest to slowest
    const isNt = (time?: string) => !time || /^nt$/i.test(time.trim())
    const isNtA = isNt(a.seedTime)
    const isNtB = isNt(b.seedTime)

    if (isNtA && !isNtB) return 1
    if (!isNtA && isNtB) return -1
    if (!isNtA && !isNtB) {
      const msA = parseTime(a.seedTime!)
      const msB = parseTime(b.seedTime!)
      if (Number.isFinite(msA) && Number.isFinite(msB) && msA !== msB) {
        return msA - msB
      }
    }

    // 2. Fallback to seedRank if seedTime is the same
    const rA = a.seedRank != null ? Number(a.seedRank) : Infinity
    const rB = b.seedRank != null ? Number(b.seedRank) : Infinity
    if (rA !== rB) return rA - rB
  }

  return compareIndividualEntries(a, b)
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
  const { athleteGenders, allEntries, eventNumberOptions } = ctx
  const isRelay = entry.entryType === "relay_team"
  const eventNumber = resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions)
  const res = rowRoundResult(entry, allEntries)
  const podiumPlace = finalsPodiumPlace(entry)
  const relayLetter = isRelay ? `Relay ${displayRelayLetter(entry.relayLetter)}` : undefined
  // Under an athlete, a relay also shows the leg they swam and their split (a leg 1 split is
  // their leadoff time, so leadoffs don't get rows of their own).
  const swimmer =
    isRelay && !eventView && athleteId
      ? entry.relaySwimmers?.find((s) => s.athleteId === athleteId)
      : undefined
  const split = sanitizeRelaySplitTime(swimmer?.splitTime)
  const legSplit = split ? formatDisplayTime(split) : null
  const relayLeg = swimmer
    ? [`Leg ${swimmer.leg}`, legSplit].filter(Boolean).join(" · ")
    : undefined

  const heat = formatHeat(entry)
  const lane = isRelay ? relayLane(entry) : individualLane(entry)
  const heatLane =
    [heat, lane != null ? `Lane ${lane}` : null, entry.startTime].filter(Boolean).join(" · ") || null

  const tags = !isRelay ? displayMeetResultTags(entry.resultTags ?? "") : null
  const sub = tags ?? ""

  const result: RowResult = entry.rosterOnly
    ? { kind: "none" }
    : res.time || res.status
      ? {
          kind: "done",
          time: res.time,
          status: res.status,
          delta:
            res.seed && res.time && res.seed !== "NT"
              ? formatSeedTimeDelta(res.seed, res.time)
              : null,
          place: res.place,
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
    heat,
    lane,
    heatLane,
    sub,
    result,
    eventName,
    badgeNumber: !eventView && eventNumber > 0 ? eventNumber : undefined,
    label: eventView ? (isRelay ? relayLetter : entry.athleteName) : eventName,
    team: !eventView ? [relayLetter, relayLeg].filter(Boolean).join(" · ") || undefined : undefined,
    round: entry.rosterOnly ? null : res.label,
  }
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
  // letter folded in rather than repeated in the meta.
  const relayName = eventView
    ? view.label
    : `${entry.event.replace(/\s+Relay$/i, "")} ${displayRelayLetter(entry.relayLetter)}`
  // A relay's leg rides beside its name, with the athlete's split on the line below.
  const startTime = (display.showHeatLane && entry.startTime) || undefined
  const meta = [
    display.showRound ? view.round : null,
    !view.isRelay ? view.team : view.legSplit ? `Split ${view.legSplit}` : null,
  ]
    .filter(Boolean)
    .join(" | ")
  // Heat & lane get their own column, compact: "Heat 2 of 4" + lane 5 → "H2 of 4 · L5".
  const heatLane = display.showHeatLane
    ? [
        view.heat?.replace(/^Heat\s+/i, "H"),
        view.lane != null ? `L${view.lane}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : ""
  return {
    eventNumber: view.badgeNumber,
    label: (view.isRelay ? relayName : view.label) ?? "",
    sub:
      (view.isRelay ? view.relayLegNumber && `Leg ${view.relayLegNumber}` : view.sub) || undefined,
    meta: meta || undefined,
    heatLane: heatLane || undefined,
    startTime,
    legs: view.isRelay
      ? [...(entry.relaySwimmers ?? [])].sort((a, b) => a.leg - b.leg).map((s) => s.name)
      : undefined,
    result: view.result,
  }
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
}: {
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
}) {
  const [editOpen, setEditOpen] = useState(false)
  const athleteRecord = athletes?.find((a) => a.id === entry.athleteId)
  const compact = display.density === "compact"
  const view = summaryRowView(
    entry,
    { athleteGenders, allEntries, eventNumberOptions },
    eventView,
    athleteId
  )
  const { isRelay, eventNumber, res, podiumPlace, relayLetter, heat, lane, heatLane, sub, result, eventName } =
    view
  // Rows split per round carry that round's swimId; timed-finals rows only have the result
  // ids. Used for the `#swim-<id>` anchor that athlete-profile links scroll to and open.
  const anchorSwimId =
    entry.swimId ?? entry.resultSwimId ?? entry.finalSwimId ?? entry.prelimSwimId
  const detailTitle = entry.rosterOnly
    ? eventName
    : detailEventTitle(
        entry.event,
        isRelay
          ? effectiveRelayGender(entry, athleteGenders)
          : entry.gender || athleteGenders?.get(entry.athleteId)
      )
  const coachNote = isRelay && canEdit ? relayCoachIncompleteNote(entry) ?? undefined : undefined

  // Detail modal
  let detail: SwimDetail
  if (isRelay) {
    detail = {
      kind: "relay",
      eventNumber: eventNumber || undefined,
      title: detailTitle,
      subLine: [relayLetter, res.label].filter(Boolean).join(" · "),
      rounds: [
        {
          label: res.label ?? "Relay",
          time: res.time,
          place: res.place,
          podium: effectiveRelayRound(entry) !== "P",
          seedTime: res.seed && res.seed !== "NT" ? res.seed : undefined,
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
      podium: podiumPlace != null,
      seedTime: res.seed && res.seed !== "NT" ? res.seed : undefined,
      seedRank: displaySeedRank(entry),
      heat: formatHeatNumber(heat),
      startTime: entry.startTime || undefined,
      lane,
      splits: entryDisplaySplits(entry),
    }
    const detailRounds = rounds.length > 0 ? rounds : [fallback]
    detail = {
      kind: "individual",
      eventNumber: eventNumber || undefined,
      athleteName: entry.athleteName,
      athleteHref: athletePath(athleteRecord?.slug ?? entry.athleteId),
      title: detailTitle,
      subLine:
        detailRounds.length > 1 ? detailRounds.map((r) => r.label).join(" · ") : detailRounds[0].label,
      rounds: detailRounds,
    }
  }

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

  return (
    <>
      <SummaryRow
        id={anchorSwimId ? `swim-${anchorSwimId}` : undefined}
        display={display}
        eventNumber={view.badgeNumber}
        avatar={
          eventView && !isRelay ? (
            <AthleteAvatar image={athleteRecord?.image} name={entry.athleteName} compact={compact} />
          ) : undefined
        }
        label={eventView && !isRelay ? <RosterName name={entry.athleteName} /> : view.label}
        sub={sub || undefined}
        team={view.team}
        round={view.round}
        heatLane={heatLane}
        note={coachNote}
        result={result}
        detail={detail}
        trailing={removeButton}
        onEdit={editor ? () => setEditOpen(true) : undefined}
        editLabel={isRelay ? "Edit relay" : "Edit"}
      />
      {editor}
    </>
  )
}

const DENSITY_KEY = "swimbuzz-summary-row-density"
const ROWINFO_KEY = "swimbuzz-summary-row-info"

const toolbarButton =
  "inline-flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill"

export default function MeetSheetSummarySection({
  psychSummary,
  heatSummary,
  finalsHeatSummary,
  entriesSummary,
  results,
  relayResults,
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
}: {
  psychSummary?: SheetSummary | null
  heatSummary?: SheetSummary | null
  finalsHeatSummary?: SheetSummary | null
  entriesSummary?: SheetSummary | null
  results?: MeetResultEntry[] | null
  relayResults?: SheetSummary["entries"] | null
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
}) {
  const editableSeedKeySet = new Set(editableSeedKeys)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewByEvent, setViewByEvent] = useState(false)
  const [viewMode, setViewMode] = useState<"summary" | "roster">("summary")
  const [genderFilter, setGenderFilter] = useState<"all" | "F" | "M">("all")
  const [density, setDensity] = useState<RowDensity>("cozy")
  const [showRound, setShowRound] = useState(true)
  const [showHeatLane, setShowHeatLane] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    let saved: { density?: RowDensity; round?: boolean; hl?: boolean } = {}
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
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEscapeToClose(settingsOpen, () => setSettingsOpen(false))

  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const show = () => {
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

  const display: RowDisplay = { density, showRound, showHeatLane }

  const athleteGenders = new Map(
    athletes
      .filter((a): a is typeof a & { gender: "M" | "F" } => a.gender === "M" || a.gender === "F")
      .map((a) => [a.id, a.gender])
  )
  const athleteNames = new Map(athletes.map((a) => [a.id, a.name]))

  const summary = applyRosterNames(
    mergeSheetSummaries(
      psychSummary,
      heatSummary,
      results ?? [],
      relayResults,
      entriesSummary,
      finalsHeatSummary
    ),
    athleteNames
  )
  const relays = summary ? uniqueRelayTeams(summary.entries, athleteGenders) : []
  const hasImportedResults = Boolean(
    (results?.length ?? 0) > 0 ||
      (relayResults ?? []).some((e) =>
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
  // A relay leadoff shows on its relay's row (as that athlete's leg 1 split), not as a row of its own.
  const displayEntries = summary
    ? dropSeedOnlyAfterResults(
        expandIndividualResultRows(inferResultHeatTotals(summary.entries)),
        hasImportedResults,
        editableSeedKeySet
      ).filter((entry) => !entry.isRelayLeadoff)
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
  const matchesGenderFilter = (entry: SummaryEntry) => {
    if (genderFilter === "all") return true
    if (entry.entryType === "relay_team") {
      const relayGender = effectiveRelayGender(entry, athleteGenders)
      return relayGender === genderFilter || relayGender === "X"
    }
    return (entry.gender ?? athleteGenders.get(entry.athleteId)) === genderFilter
  }
  const filteredMyEntries = myEntries.filter(
    (entry) =>
      matchesGenderFilter(entry) &&
      (!q ||
        entry.athleteName.toLowerCase().includes(q) ||
        entry.event.toLowerCase().includes(q))
  )
  const filterAthleteGroups = (groups: typeof grouped) =>
    groups
      .map((athleteGroup) => ({
        ...athleteGroup,
        entries: athleteGroup.entries.filter(matchesGenderFilter),
      }))
      .filter(
        (athleteGroup) =>
          athleteGroup.entries.length > 0 &&
          (!q ||
            athleteGroup.name.toLowerCase().includes(q) ||
            athleteGroup.entries.some((entry) => entry.event.toLowerCase().includes(q)))
      )
  const filteredOtherGrouped = filterAthleteGroups(otherGrouped)

  // For the "by event" view: use the de-duped relay list (the same relays the by-athlete sections use)
  // so that seed rows from the heat sheet don't appear as duplicates alongside result rows.
  const deduplicatedByEventEntries: SummaryEntry[] = [
    ...displayEntries.filter((entry) => entry.entryType !== "relay_team"),
    ...relays,
  ].filter(matchesGenderFilter)

  const rawGroupedEvents = deduplicatedByEventEntries.reduce((acc, entry) => {
    const gender =
      entry.entryType === "relay_team"
        ? effectiveRelayGender(entry, athleteGenders) || entry.gender || "U"
        : entry.gender || athleteGenders.get(entry.athleteId) || "U"
    const eventNumber = resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions)
    const title = `${eventGenderWord(gender) ?? ""} ${entry.event}`.trim()
    // Use the eventNumber, gender, and event name for unique grouping
    const key = `${eventNumber}|${title}`
    if (!acc.has(key)) {
      acc.set(key, { key, title, eventNumber, entries: [] })
    }
    acc.get(key)!.entries.push(entry)
    return acc
  }, new Map<string, { key: string; title: string; eventNumber: number; entries: SummaryEntry[] }>())

  // Placeholder counts follow the gender filter but not the search query.
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`
  const genderSuffix = genderFilter === "all" ? "" : ` (${genderFilter === "F" ? "Women" : "Men"})`
  const searchPlaceholder =
    viewMode === "roster"
      ? `Search ${plural(
          rosterAthletes.filter((a) => genderFilter === "all" || a.gender === genderFilter).length,
          "athlete"
        )}${genderSuffix}…`
      : `Search ${plural(
          grouped.filter((g) => g.entries.some(matchesGenderFilter)).length,
          "athlete"
        )} and ${plural(
          [...rawGroupedEvents.values()].filter((g) =>
            g.entries.some((e) => !e.rosterOnly && matchesGenderFilter(e))
          ).length,
          "event"
        )}${genderSuffix}…`

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
      return a.title.localeCompare(b.title)
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
  }


  const viewerRecord = viewerAthleteId ? athletes.find((a) => a.id === viewerAthleteId) : undefined
  const addMenuVisible = canEdit && meetId

  /**
   * The view as it's shown — same mode, filters, search, order and row toggles — for the PDF export,
   * minus the viewer's pinned section: they're listed in their usual place like everyone else.
   */
  function buildPdfRequest(): RosterSummaryPdfRequest {
    const rowCtx = { athleteGenders, allEntries: displayEntries, eventNumberOptions }
    const toRow = (entry: SummaryEntry, eventView = false, athleteId?: string) =>
      summaryRowPdf(entry, rowCtx, display, eventView, athleteId)
    // "Entries" → "Heats" once a heat sheet is in → "Results" once results are posted.
    const title = rosterSummaryTitle({
      hasHeatSheet: Boolean(heatSummary || finalsHeatSummary),
      hasResults: hasImportedResults,
    })
    const heading = [
      viewMode === "roster" ? "Roster" : `${title} by ${viewByEvent ? "Event" : "Athlete"}`,
      genderFilter === "F" ? "Women" : genderFilter === "M" ? "Men" : null,
      q ? `“${searchQuery.trim()}”` : null,
    ]
      .filter(Boolean)
      .join(" · ")

    let sections: RosterSummaryPdfSection[] = []
    if (!hasContent) return { heading, sections }
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
      sections = sortedEventGroups.map((group) => ({
        title: group.title,
        eventNumber: group.eventNumber > 0 ? group.eventNumber : undefined,
        rows: [...group.entries]
          .sort((a, b) => compareByPlace(a, b, hasImportedResults))
          .map((entry) => toRow(entry, true)),
      }))
      return { heading, sections, splitSections: true }
    } else {
      for (const athleteGroup of filterAthleteGroups(grouped)) {
        sections.push({
          title: athleteGroup.name,
          // Under an athlete, a relay is just the event — no list of its swimmers.
          rows: [...athleteGroup.entries]
            .sort(compareMyEntries)
            .map((entry) => ({ ...toRow(entry, false, athleteGroup.athleteId), legs: undefined })),
        })
      }
    }
    return { heading, sections }
  }

  return (
    <section ref={sectionRef} className="scroll-mt-4">
      <div className="mb-3 flex items-center gap-2 pb-1">
        <input
          type="search"
          aria-label={viewMode === "roster" ? "Search athletes" : "Search athletes or events"}
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/35"
        />

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

        {meetId ? (
          <ShareRosterSummaryButton
            meetId={meetId}
            meetName={meetName ?? ""}
            buildRequest={buildPdfRequest}
            onOpen={() => setSettingsOpen(false)}
          />
        ) : null}

        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="View settings"
            title="View settings"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            onClick={() => {
              setSettingsOpen(!settingsOpen)
            }}
            className={toolbarButton}
          >
            <LedgerIcon name="settings" className="h-[18px] w-[18px] shrink-0" />
          </button>
          {settingsOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} />
              <div role="menu" className={menuPanel}>
                <MenuItem
                  icon="grid"
                  label="Summary"
                  selected={viewMode === "summary"}
                  onClick={() => {
                    setViewMode("summary")
                    setSettingsOpen(false)
                  }}
                />
                <MenuItem
                  icon="list"
                  label="Roster"
                  selected={viewMode === "roster"}
                  onClick={() => {
                    setViewMode("roster")
                    setSettingsOpen(false)
                  }}
                />
                {viewMode === "summary" ? (
                  <>
                    <MenuDivider />
                    <MenuItem
                      icon="user"
                      label="By athlete"
                      selected={!viewByEvent}
                      onClick={() => {
                        setViewByEvent(false)
                        setSettingsOpen(false)
                      }}
                    />
                    <MenuItem
                      icon="numberedList"
                      label="By event"
                      selected={viewByEvent}
                      onClick={() => {
                        setViewByEvent(true)
                        setSettingsOpen(false)
                      }}
                    />
                  </>
                ) : null}
                <MenuDivider />
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
                <MenuDivider />
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
                <MenuDivider />
                <MenuItem
                  role="menuitemcheckbox"
                  icon="flag"
                  label="Show round"
                  selected={showRound}
                  onClick={() => toggleRowInfo("round")}
                />
                <MenuItem
                  role="menuitemcheckbox"
                  icon="lanes"
                  label="Show heat & lane"
                  selected={showHeatLane}
                  onClick={() => toggleRowInfo("hl")}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      {!hasContent ? (
        <div className="rounded-xl border border-border bg-background px-4 py-10 text-center text-sm text-foreground-secondary">
          {viewMode === "roster"
            ? "No athletes on the roster match these filters."
            : "No entries match these filters."}
        </div>
      ) : viewMode === "roster" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="px-4 py-2.5 text-sm font-medium text-foreground">
            {filteredRosterAthletes.length} athlete{filteredRosterAthletes.length === 1 ? "" : "s"}
          </div>
          <ul>
            {filteredRosterAthletes.map((athlete) => {
              const isMe = athlete.id === viewerAthleteId
              const count = eventCountByAthlete.get(athlete.id) ?? 0
              return (
                <li key={athlete.id} className="border-t border-border">
                  <Link
                    href={athletePath(athlete.slug ?? athlete.id)}
                    className={`grid grid-cols-[1fr_96px_72px] items-center px-4 py-3 text-sm text-foreground transition-colors hover:bg-fill hover:text-primary ${
                      isMe ? "bg-accent/5" : ""
                    }`}
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
              className="overflow-hidden rounded-xl border border-border-secondary bg-background"
            >
              <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-foreground">
                {group.eventNumber > 0 ? (
                  <EventBadge number={group.eventNumber} compact={false} />
                ) : null}
                <span>{group.title}</span>
              </div>
              <ul className="border-t border-border-subtle">
                {[...group.entries]
                  .sort((a, b) => compareByPlace(a, b, hasImportedResults))
                  .map((entry, j) => (
                    <SummaryEntryRow
                      key={`event-${entryRowKey(entry, j, athleteGenders)}`}
                      entry={entry}
                      eventView
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
              {/* Tint layered over the opaque base so the meet background doesn't show through. */}
              <div className="bg-accent/[0.04]">
                <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent">
                  <AthleteAvatar
                    image={viewerRecord?.image}
                    name={athleteNames.get(viewerAthleteId!) || "My Profile"}
                  />
                  <span>
                    <RosterName name={athleteNames.get(viewerAthleteId!) ?? ""} />
                  </span>
                </div>
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
                className="overflow-hidden rounded-xl border border-border bg-background"
              >
                <Link
                  href={athletePath(athleteData?.slug ?? athleteGroup.athleteId)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  <AthleteAvatar image={athleteData?.image} name={athleteGroup.name} />
                  <span>
                    <RosterName name={athleteGroup.name} />
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
    </section>
  )
}

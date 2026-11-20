import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { ActivityIndicator, Alert, Platform, Pressable, Text, View, type ScrollView } from "react-native"
import * as Clipboard from "expo-clipboard"
import * as Sharing from "expo-sharing"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  alternateLabel,
  formatPoints,
  eventGenderWord,
  relayLegLabel,
  relayLegOrdinal,
  relayLegSubSplitList,
  relayLegSubSplitTimes,
  roundFilterIncludes,
  roundFilterChips,
  roundFilterLabel,
  rosterSummaryScopeLabel,
  rosterSummaryText,
  rosterSummarySessions,
  rosterSummaryTitle,
  sessionIncludes,
  sessionRound,
  splitRosterName,
  SUMMARY_ROUNDS,
  type CoachHeatLane,
  type HeatLaneFields,
  type MeetHeaderDetails,
  type MeetSessionOrder,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfSection,
  type SessionRound,
  type SetHeatLaneInput,
  type SummaryRoundKind,
} from "@swimbuzz/shared"
import {
  ActionSheet,
  BottomSheet,
  Body,
  Chip,
  EmptyState,
  ListRow,
  Muted,
  Section,
  SectionHeader,
  TextField,
  usePalette,
  type ActionSheetItem,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../lib/api"
import { rosterSummaryPdfFile, saveCaptureToPhotos } from "../lib/roster-summary-share"
import { HeatLaneSheet, type HeatLaneSlot } from "./HeatLaneSheet"
import { Icon } from "./Icon"
import { RosterSummaryExportCapture } from "./RosterSummaryExportCapture"
import { RosterSummaryJumpBar, rosterSummaryJumpLetter, type RosterSummaryJumpTarget } from "./RosterSummaryJumpBar"
import { SegmentedOption, SegmentedToggle } from "./SegmentedToggle"

/** Per meet: the list's view and filters, kept for a while (like the web's saved view), not for good. */
const VIEW_KEY_PREFIX = "swimbuzz.summaryView:"
const VIEW_TTL_MS = 12 * 60 * 60 * 1000

type SavedSummaryView = {
  savedAt: number
  mode: "athlete" | "event"
  mineOnly: boolean
  gender: "all" | "F" | "M"
  session: string | null
  hiddenRounds: SummaryRoundKind[]
}

async function readSavedView(meetId: string): Promise<SavedSummaryView | null> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(`${VIEW_KEY_PREFIX}${meetId}`)) || "null") as
      | Partial<SavedSummaryView>
      | null
    if (!v || typeof v.savedAt !== "number" || Date.now() - v.savedAt > VIEW_TTL_MS) return null
    return {
      savedAt: v.savedAt,
      mode: v.mode === "event" ? "event" : "athlete",
      mineOnly: v.mineOnly === true,
      gender: v.gender === "F" || v.gender === "M" ? v.gender : "all",
      session: typeof v.session === "string" ? v.session : null,
      hiddenRounds: Array.isArray(v.hiddenRounds)
        ? v.hiddenRounds.filter((k): k is SummaryRoundKind => k === "P" || k === "F" || k === "T")
        : [],
    }
  } catch {
    return null
  }
}

/** A filter that's on, as a removable chip under the search field. */
type ActiveFilter = { key: string; label: string; clear: () => void }

/** One labelled group of chips in the filters sheet. */
function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const c = usePalette()
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: c.textTertiary,
          marginBottom: spacing.xs,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{children}</View>
    </View>
  )
}

export type RosterSummaryEntry = {
  athleteId: string
  athleteName: string
  event: string
  eventNumber?: number
  entryType?: "individual" | "relay_team"
  seedTime?: string
  heat?: number
  heatTotal?: number
  lane?: number
  prelimHeat?: number
  prelimHeatTotal?: number
  prelimLane?: number
  finalHeat?: number
  finalHeatTotal?: number
  finalLane?: number
  /** The heat's start time from the heat sheet ("03:19 PM"). */
  startTime?: string | null
  /** Each round's start time once the entry holds both rounds' heats (then `startTime` is unset). */
  prelimStartTime?: string | null
  finalStartTime?: string | null
  /** Coach-added heat & lane per round, shown only where no import has that field. */
  coachHeatLane?: CoachHeatLane
  /** Heat-sheet round text ("Timed Finals"). */
  round?: string
  resultRound?: string
  resultTime?: string
  prelimTime?: string
  finalTime?: string
  resultPlace?: number
  prelimPlace?: number
  finalPlace?: number
  /** Points scored (results PDF Points column), per round like the places. */
  resultPoints?: number
  prelimPoints?: number
  finalPoints?: number
  resultStatus?: string
  /** Swim-off (tie-breaker) result row. */
  isSwimOff?: boolean
  /** A relay leg 1 split as its own row; shown on the relay's row instead. */
  isRelayLeadoff?: boolean
  alternate?: boolean
  /** An alternate's place in line (1st, 2nd alternate). */
  alternateNumber?: number
  rosterOnly?: boolean
  relayLetter?: string | null
  relayRound?: string
  gender?: string
  relaySwimmers?: Array<{
    leg: number
    name: string
    athleteId?: string
    splitTime?: string
    /** The leg's own interval splits (the 50s of a 100 leg), when the results time them. */
    splits?: Array<{ distance: number; splitTime: string }>
  }>
  /** Individual race splits (interval times), per round where the swim has both. */
  splits?: Array<{ distance: number; splitTime: string }>
  prelimSplits?: Array<{ distance: number; splitTime: string }>
  finalSplits?: Array<{ distance: number; splitTime: string }>
}

/** Heat & lane — for that round's swim when the view is filtered to a prelims or finals session. */
function formatHeatLane(entry: RosterSummaryEntry, round?: SessionRound | null): string | null {
  if (entry.alternate) return alternateLabel(entry.alternateNumber)
  const { heat, heatTotal, lane } = heatLaneFor(entry, round)
  const parts: string[] = []
  if (heat != null && heat > 0) {
    parts.push(heatTotal != null ? `H${heat}/${heatTotal}` : `H${heat}`)
  }
  if (lane != null && lane > 0) parts.push(`L${lane}`)
  return parts.length ? parts.join(" · ") : null
}

function heatLaneFor(entry: RosterSummaryEntry, round?: SessionRound | null) {
  const imported = importedHeatLaneFor(entry, round)
  const coach = coachHeatLaneFor(entry, round)
  return {
    heat: imported.heat ?? coach.heat ?? null,
    heatTotal: imported.heatTotal ?? coach.heatTotal,
    lane: imported.lane ?? coach.lane ?? null,
  }
}

/** Heat & lane from the heat sheets and results — for that round's swim when the view names one. */
export function importedHeatLaneFor(entry: RosterSummaryEntry, round?: SessionRound | null): HeatLaneFields {
  const heat =
    round === "F"
      ? entry.finalHeat ?? entry.heat
      : round === "P"
        ? entry.prelimHeat ?? entry.heat
        : entry.heat ?? entry.finalHeat ?? entry.prelimHeat
  const heatTotal =
    round === "F"
      ? entry.finalHeatTotal ?? entry.heatTotal
      : round === "P"
        ? entry.prelimHeatTotal ?? entry.heatTotal
        : entry.heatTotal
  const lane =
    round === "F"
      ? entry.finalLane ?? entry.lane
      : round === "P"
        ? entry.prelimLane ?? entry.lane
        : entry.lane ?? entry.finalLane ?? entry.prelimLane
  const startTime =
    round === "F"
      ? entry.finalStartTime || entry.startTime
      : round === "P"
        ? entry.prelimStartTime || entry.startTime
        : entry.startTime || entry.finalStartTime || entry.prelimStartTime
  return {
    heat: heat != null && heat > 0 ? heat : undefined,
    heatTotal: heatTotal ?? undefined,
    lane: lane ?? undefined,
    startTime: startTime || undefined,
  }
}

/** The coach's heat & lane for that round, or (with no round) whichever round has one. */
function coachHeatLaneFor(entry: RosterSummaryEntry, round?: SessionRound | null): HeatLaneFields {
  const coach = entry.coachHeatLane
  if (!coach) return {}
  if (round) return coach[round] ?? {}
  const pick = <K extends keyof HeatLaneFields>(field: K) =>
    coach.T?.[field] ?? coach.F?.[field] ?? coach.P?.[field]
  return { heat: pick("heat"), heatTotal: pick("heatTotal"), lane: pick("lane"), startTime: pick("startTime") }
}

/**
 * The rounds of a row a coach can add heat & lane to (only the session's round when the view names
 * one), or null when every field already comes from an import.
 */
function heatLaneSlots(entry: RosterSummaryEntry, round?: SessionRound | null): HeatLaneSlot[] | null {
  if (entry.isRelayLeadoff || entry.isSwimOff || entry.rosterOnly) return null
  // Saved by the rounds imports give the row, so a coach-picked round doesn't move them; a row with
  // none keeps its heat & lane (and the coach's round) on T.
  const imported = importedRoundKinds(entry)
  const kinds: SummaryRoundKind[] = imported.length === 0 ? ["T"] : round ? [round] : imported
  const slots: HeatLaneSlot[] = kinds
    // Alternates are finals-only and have no heat or lane.
    .filter((kind) => !(kind === "F" && entry.alternate))
    .map((slot) => ({
      slot,
      imported: importedHeatLaneFor(entry, slot === "T" ? null : slot),
      coach: entry.coachHeatLane?.[slot] ?? {},
      roundEditable: imported.length === 0,
    }))
  const missing = slots.some(
    (s) =>
      s.roundEditable ||
      (["heat", "heatTotal", "lane", "startTime"] as const).some((f) => s.imported[f] == null)
  )
  return missing ? slots : null
}

/** Which row a heat & lane is saved to. */
function heatLaneRow(entry: RosterSummaryEntry): Omit<SetHeatLaneInput, "slot"> {
  return entry.entryType === "relay_team"
    ? { kind: "relay", event: entry.event, relayLetter: entry.relayLetter ?? null, gender: entry.gender ?? "" }
    : { kind: "individual", athleteId: entry.athleteId, event: entry.event }
}

/**
 * The heat's start time — that round's when the view names one, picked like the heat & lane — or
 * the coach's when no heat sheet has one.
 */
function startTimeFor(entry: RosterSummaryEntry, round?: SessionRound | null): string | undefined {
  if (entry.alternate) return undefined
  return importedHeatLaneFor(entry, round).startTime || coachHeatLaneFor(entry, round).startTime || undefined
}

/** The entry's place — in that round when the view is filtered to a prelims or finals session. */
function placeFor(entry: RosterSummaryEntry, round?: SessionRound | null): number | undefined {
  if (round === "P") return entry.prelimPlace
  if (round === "F") return entry.finalPlace ?? (entry.prelimPlace == null ? entry.resultPlace : undefined)
  return entry.finalPlace ?? entry.resultPlace ?? entry.prelimPlace
}

/** Numbers ascending, with missing ones (and non-positive heats/lanes) last. */
function compareMissingLast(a: number | null | undefined, b: number | null | undefined): number {
  const av = a != null && a > 0 ? a : undefined
  const bv = b != null && b > 0 ? b : undefined
  if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1
  return av - bv
}

/**
 * One event's entries in swim order: by place once its results are in, else by heat and lane.
 * Entries without a place (DQ, NS) follow the placed ones; alternates come last.
 */
function sortEventEntries(entries: RosterSummaryEntry[], round?: SessionRound | null) {
  const placed = entries.some((entry) => placeFor(entry, round) != null)
  return entries.slice().sort((a, b) => {
    if (Boolean(a.alternate) !== Boolean(b.alternate)) return a.alternate ? 1 : -1
    if (placed) {
      const byPlace = compareMissingLast(placeFor(a, round), placeFor(b, round))
      if (byPlace !== 0) return byPlace
    }
    const ah = heatLaneFor(a, round)
    const bh = heatLaneFor(b, round)
    return compareMissingLast(ah.heat, bh.heat) || compareMissingLast(ah.lane, bh.lane)
  })
}

/**
 * The rounds an entry stands for — mobile entries carry prelims and finals on one row — with the
 * coach's round for one no import has given any. Empty when unknown (a seed before any heat sheet).
 */
export function entryRoundKinds(entry: RosterSummaryEntry): SummaryRoundKind[] {
  const kinds = importedRoundKinds(entry)
  const coach = entry.coachHeatLane?.T?.round
  return kinds.length === 0 && coach ? [coach] : kinds
}

/** The rounds the heat sheets and results give an entry, leaving out a coach-picked one. */
function importedRoundKinds(entry: RosterSummaryEntry): SummaryRoundKind[] {
  const kinds: SummaryRoundKind[] = []
  const round = entry.resultRound || entry.relayRound
  if (
    round === "P" ||
    entry.prelimTime ||
    entry.prelimPlace != null ||
    entry.prelimHeat != null ||
    entry.isSwimOff
  ) {
    kinds.push("P")
  }
  if (round === "F" || entry.finalTime || entry.finalPlace != null || entry.finalHeat != null) {
    kinds.push("F")
  }
  if (kinds.length === 0 && (/timed/i.test(entry.round ?? "") || entry.resultTime)) kinds.push("T")
  return kinds
}

function formatTimes(entry: RosterSummaryEntry): string | null {
  const parts: string[] = []
  if (entry.seedTime) parts.push(`Seed ${entry.seedTime}`)
  if (entry.prelimTime) parts.push(`P ${entry.prelimTime}`)
  if (entry.finalTime) parts.push(`F ${entry.finalTime}`)
  if (entry.resultTime && !entry.prelimTime && !entry.finalTime) {
    parts.push(entry.isSwimOff ? `Swim-off ${entry.resultTime}` : entry.resultTime)
  }
  if (entry.resultStatus) parts.push(entry.resultStatus)
  return parts.length ? parts.join(" · ") : null
}

function formatPlace(entry: RosterSummaryEntry): string | null {
  if (entry.finalPlace != null) return `${entry.finalPlace}`
  if (entry.resultPlace != null) return `${entry.resultPlace}`
  if (entry.prelimPlace != null) return `P${entry.prelimPlace}`
  return null
}

/** "20 pts" for the round whose place shows. */
function formatEntryPoints(entry: RosterSummaryEntry): string | null {
  const points =
    entry.finalPlace != null
      ? entry.finalPoints
      : entry.resultPlace != null
        ? entry.resultPoints
        : entry.prelimPoints
  return points != null ? `${formatPoints(points)} pts` : null
}

function entryTitle(entry: RosterSummaryEntry): string {
  if (entry.entryType === "relay_team") {
    const letter = entry.relayLetter ? ` ${entry.relayLetter}` : ""
    // A relay no import has given a round shows the coach's prelims or finals.
    const coachRound = entry.coachHeatLane?.T?.round
    const relayRound = entry.relayRound || (coachRound === "P" || coachRound === "F" ? coachRound : "")
    const round = relayRound ? ` (${relayRound})` : ""
    return `${entry.event}${letter}${round}`
  }
  return entry.event
}

function relayLegNames(entry: RosterSummaryEntry): string[] {
  return (entry.relaySwimmers ?? [])
    .slice()
    .sort((a, b) => a.leg - b.leg)
    .map((s) => s.name)
}

/** Each leg's split in leg order ("" when there isn't one), beside the names from relayLegNames. */
function relayLegSplits(entry: RosterSummaryEntry): string[] {
  return (entry.relaySwimmers ?? [])
    .slice()
    .sort((a, b) => a.leg - b.leg)
    .map((s) => {
      const split = s.splitTime?.trim()
      return split && /\d/.test(split) ? split : ""
    })
}

/** Each leg's sub-splits in leg order ([] for a leg without them), beside relayLegNames. */
function relayLegSubSplits(entry: RosterSummaryEntry): string[][] {
  return (entry.relaySwimmers ?? [])
    .slice()
    .sort((a, b) => a.leg - b.leg)
    .map((s) => relayLegSubSplitTimes(s.splits))
}

/**
 * An individual swim's interval splits — that round's when the view is filtered to prelims or
 * finals, else the finals' — leaving out missing ones ("No Data").
 */
function swimSplits(entry: RosterSummaryEntry, round?: SessionRound | null) {
  if (entry.entryType === "relay_team") return undefined
  const splits =
    round === "P"
      ? entry.prelimSplits ?? (entry.resultRound !== "F" ? entry.splits : undefined)
      : round === "F"
        ? entry.finalSplits ?? (entry.resultRound !== "P" ? entry.splits : undefined)
        : entry.finalSplits ?? entry.splits ?? entry.prelimSplits
  return (splits ?? [])
    .map((s) => ({ distance: s.distance, time: s.splitTime?.trim() ?? "" }))
    .filter((s) => /\d/.test(s.time))
}

/**
 * The leg an athlete swam on a relay with their split, e.g. "1st - 25.31". The leg's own 50s are
 * left to the exports.
 */
function athleteLegLabel(entry: RosterSummaryEntry, athleteId: string | undefined): string | null {
  if (entry.entryType !== "relay_team" || !athleteId) return null
  const swimmer = entry.relaySwimmers?.find((s) => s.athleteId === athleteId)
  if (!swimmer) return null
  const split = swimmer.splitTime?.trim()
  return relayLegLabel(swimmer.leg, split && /\d/.test(split) ? split : null)
}

/** `athleteId` is the athlete whose group the row sits in, so a relay shows their leg and split. */
function entrySubtitle(
  entry: RosterSummaryEntry,
  mode: "athlete" | "event",
  withLegs = true,
  athleteId?: string,
  withHeatLane = true,
  round?: SessionRound | null
): string {
  const bits = [
    mode === "event" ? entry.athleteName : athleteLegLabel(entry, athleteId),
    withHeatLane ? formatHeatLane(entry, round) : null,
    withHeatLane ? startTimeFor(entry, round) : null,
    formatTimes(entry),
    formatPlace(entry) ? `Place ${formatPlace(entry)}` : null,
    formatEntryPoints(entry),
  ].filter(Boolean)
  if (withLegs && entry.entryType === "relay_team" && entry.relaySwimmers?.length) {
    bits.push(relayLegNames(entry).join(", "))
  }
  return bits.join(" · ")
}

/** "Last, First" with "(Preferred)" muted, like the web roster page — nested inside a Text. */
function RosterNameText({ name, mutedColor }: { name: string; mutedColor: string }) {
  const { name: base, preferred } = splitRosterName(name)
  return (
    <>
      {base}
      {preferred ? (
        <Text style={{ fontWeight: "400", color: mutedColor }}>{` (${preferred})`}</Text>
      ) : null}
    </>
  )
}

/**
 * A list row as a PDF row: title and subtitle, plus relay legs, with heat & lane in their own
 * column. The subtitle leaves out the athlete's name, which the label (or section title) already
 * carries. Relay titles are compact, with the letter folded in: "200 Medley A (P)".
 */
function pdfRow(
  entry: RosterSummaryEntry,
  title: string,
  athleteId?: string,
  round?: SessionRound | null
) {
  const isRelay = entry.entryType === "relay_team"
  // The athlete's leg and split lead the line below the relay's name.
  const swimmer =
    isRelay && athleteId ? entry.relaySwimmers?.find((s) => s.athleteId === athleteId) : undefined
  const legNumber = swimmer?.leg
  const split = swimmer?.splitTime?.trim()
  const legSplit = split && /\d/.test(split) ? split : undefined
  const legSubSplits = isRelay ? relayLegSubSplits(entry) : []
  const relayTitleFrom = (event: string) =>
    [event, entry.relayLetter, entry.relayRound ? `(${entry.relayRound})` : null]
      .filter(Boolean)
      .join(" ")
  const relayEvent = entry.event.replace(/\s+Relay$/i, "")
  return {
    label: isRelay ? relayTitleFrom(relayEvent) : title,
    // Spelled out ("200 Medley Relay A (P)") where the line has room.
    fullLabel: isRelay ? relayTitleFrom(`${relayEvent} Relay`) : undefined,
    // As on the web summary: the leg after the relay's name ("200 Medley A (4th)"), the split under
    // the time, and the leg's own 50s (when the results time them) in split columns below.
    labelNote: legNumber && legNumber > 0 ? relayLegOrdinal(legNumber) : undefined,
    resultNote: legSplit,
    meta: entrySubtitle(entry, "athlete", false, undefined, false) || undefined,
    heatLane: formatHeatLane(entry, round)?.replace("/", " of ") ?? undefined,
    startTime: startTimeFor(entry, round),
    legs: isRelay ? relayLegNames(entry) : undefined,
    legSplits: isRelay ? relayLegSplits(entry) : undefined,
    legSubSplits: legSubSplits.some((times) => times.length) ? legSubSplits : undefined,
    splits: isRelay ? (legSplit ? relayLegSubSplitList(swimmer?.splits) : undefined) : swimSplits(entry, round),
  }
}

export function RosterSummarySection({
  entries,
  viewerAthleteId,
  meetId,
  meetName,
  hasHeatSheet,
  eventOrder = null,
  details,
  iconUrl = null,
  canEdit = false,
  onHeatLaneSaved,
  scrollRef,
}: {
  entries: RosterSummaryEntry[]
  viewerAthleteId?: string | null
  meetId: string
  meetName: string
  /** A prelims or finals heat sheet is on the meet. */
  hasHeatSheet: boolean
  /** Meet packet order of events, whose sessions ("Sunday Finals") the list can filter to. */
  eventOrder?: MeetSessionOrder | null
  /** Date and location for the PNG export's header. */
  details: MeetHeaderDetails
  iconUrl?: string | null
  /** Coaches can tap a row to add the heat & lane no import has given it. */
  canEdit?: boolean
  /** After a coach saves a heat & lane, to reload the meet. */
  onHeatLaneSaved?: () => void
  /** The screen's scroll view, for the jump bar to scroll to a group (no jump bar without it). */
  scrollRef?: RefObject<Pick<ScrollView, "scrollTo"> | null>
}) {
  const c = usePalette()
  // "Entries" → "Heats" once a heat sheet is in → "Results" once results are posted.
  const title = rosterSummaryTitle({
    hasHeatSheet,
    hasResults: entries.some(
      (entry) =>
        entry.resultTime || entry.prelimTime || entry.finalTime || entry.resultStatus
    ),
  })
  const [mode, setMode] = useState<"athlete" | "event">("athlete")
  const [query, setQuery] = useState("")
  const [mineOnly, setMineOnly] = useState(false)
  const [genderFilter, setGenderFilter] = useState<"all" | "F" | "M">("all")
  /** A packet session's label, or null for every session. */
  const [sessionFilter, setSessionFilter] = useState<string | null>(null)
  const [hiddenRounds, setHiddenRounds] = useState<ReadonlySet<SummaryRoundKind>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)

  // The view and filters come back for this meet (for 12 hours); saving waits for the restore so the
  // defaults don't overwrite the saved view first.
  const [viewRestored, setViewRestored] = useState(false)
  useEffect(() => {
    let cancelled = false
    void readSavedView(meetId).then((view) => {
      if (cancelled) return
      if (view) {
        setMode(view.mode)
        setMineOnly(view.mineOnly)
        setGenderFilter(view.gender)
        setSessionFilter(view.session)
        setHiddenRounds(new Set(view.hiddenRounds))
      }
      setViewRestored(true)
    })
    return () => {
      cancelled = true
    }
  }, [meetId])
  useEffect(() => {
    if (!viewRestored) return
    const view: SavedSummaryView = {
      savedAt: Date.now(),
      mode,
      mineOnly,
      gender: genderFilter,
      session: sessionFilter,
      hiddenRounds: [...hiddenRounds],
    }
    void AsyncStorage.setItem(`${VIEW_KEY_PREFIX}${meetId}`, JSON.stringify(view)).catch(() => {})
  }, [viewRestored, meetId, mode, mineOnly, genderFilter, sessionFilter, hiddenRounds])

  const sessions = useMemo(() => rosterSummarySessions(eventOrder), [eventOrder])
  const activeSession = sessionFilter && sessions.includes(sessionFilter) ? sessionFilter : null
  /** The round the chosen session names, for picking that round's heat & lane. */
  const activeRound = activeSession ? sessionRound(activeSession) : null
  // Rounds the summary has rows for; the round chips only show when there's more than one.
  const availableRounds = useMemo(() => {
    const present = new Set(entries.flatMap(entryRoundKinds))
    return SUMMARY_ROUNDS.map((r) => r.kind).filter((kind) => present.has(kind))
  }, [entries])
  const roundFilterOn = availableRounds.length > 1

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((entry) => {
      // A leadoff shows on its relay's row, as that athlete's leg 1 split.
      if (entry.isRelayLeadoff) return false
      const kinds = entryRoundKinds(entry)
      if (roundFilterOn && !roundFilterIncludes(hiddenRounds, kinds, availableRounds)) return false
      if (
        activeSession &&
        eventOrder &&
        !sessionIncludes(eventOrder, activeSession, {
          eventNumber: entry.eventNumber,
          event: entry.event,
          gender: entry.gender,
          rounds: kinds.filter((kind): kind is SessionRound => kind !== "T"),
        })
      ) {
        return false
      }
      if (genderFilter !== "all") {
        // A mixed relay belongs to both.
        if (entry.entryType === "relay_team" ? entry.gender !== genderFilter && entry.gender !== "X" : entry.gender !== genderFilter) {
          return false
        }
      }
      if (mineOnly && viewerAthleteId) {
        if (entry.entryType === "relay_team") {
          const onRelay = (entry.relaySwimmers ?? []).some(
            (s) => s.athleteId === viewerAthleteId
          )
          if (!onRelay) return false
        } else if (entry.athleteId !== viewerAthleteId) {
          return false
        }
      }
      if (!q) return true
      const hay = [
        entry.athleteName,
        entry.event,
        entry.relayLetter,
        ...(entry.relaySwimmers ?? []).map((s) => s.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [entries, mineOnly, genderFilter, query, viewerAthleteId, roundFilterOn, hiddenRounds, availableRounds, activeSession, eventOrder])

  // Each relay sits in the group of every swimmer on it (only the viewer's with "My events"),
  // in event order with their individual events — there's no separate relays list.
  const athleteGroups = useMemo(() => {
    const map = new Map<string, { athleteId: string; name: string; entries: RosterSummaryEntry[] }>()
    const groupFor = (athleteId: string, name: string) => {
      let group = map.get(athleteId)
      if (!group) map.set(athleteId, (group = { athleteId, name, entries: [] }))
      return group
    }
    const relayKey = (entry: RosterSummaryEntry) =>
      `${entry.event}|${entry.gender ?? ""}|${entry.relayLetter ?? ""}|${entry.relayRound ?? ""}`
    for (const entry of filtered) {
      if (entry.entryType !== "relay_team") {
        groupFor(entry.athleteId, entry.athleteName).entries.push(entry)
        continue
      }
      for (const swimmer of entry.relaySwimmers ?? []) {
        if (!swimmer.athleteId) continue
        if (mineOnly && viewerAthleteId && swimmer.athleteId !== viewerAthleteId) continue
        const group = groupFor(swimmer.athleteId, swimmer.name)
        // The summary can carry the same relay once per swimmer.
        if (!group.entries.some((e) => e.entryType === "relay_team" && relayKey(e) === relayKey(entry))) {
          group.entries.push(entry)
        }
      }
    }
    const order = (entry: RosterSummaryEntry) =>
      entry.eventNumber && entry.eventNumber > 0 ? entry.eventNumber : Number.MAX_SAFE_INTEGER
    // The viewer's own group first (as on web), then everyone by name.
    const isViewer = (athleteId: string) => Boolean(viewerAthleteId) && athleteId === viewerAthleteId
    return [...map.values()]
      .map((group) => ({ ...group, entries: group.entries.slice().sort((a, b) => order(a) - order(b)) }))
      .sort(
        (a, b) => Number(isViewer(b.athleteId)) - Number(isViewer(a.athleteId)) || a.name.localeCompare(b.name)
      )
  }, [filtered, mineOnly, viewerAthleteId])

  const eventGroups = useMemo(() => {
    const map = new Map<string, RosterSummaryEntry[]>()
    for (const entry of filtered) {
      // Roster-only "Attending" rows aren't an event.
      if (entry.rosterOnly) continue
      const key = `${entry.event}|${entry.gender ?? ""}|${entry.entryType ?? "individual"}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    // In meet order (by event number, as on web — events without one last), then by title.
    const number = (n?: number) => (n != null && n > 0 ? n : Number.MAX_SAFE_INTEGER)
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        // "Women 200 Medley Relay"
        title: list[0] ? `${eventGenderWord(list[0].gender) ?? ""} ${list[0].event}`.trim() : key,
        eventNumber: list.find((entry) => entry.eventNumber != null && entry.eventNumber > 0)?.eventNumber,
        entries: sortEventEntries(list, activeRound),
      }))
      .sort((a, b) => number(a.eventNumber) - number(b.eventNumber) || a.title.localeCompare(b.title))
  }, [filtered, activeRound])

  // Jump bar: by athlete a letter per first letter of the names listed, by event a number per
  // numbered event, each keyed to the first group it names (whose View is kept in `groupViews`).
  const groupViews = useRef(new Map<string, View>())
  const jumpTargets = useMemo(() => {
    const targets: (RosterSummaryJumpTarget & { groupKey: string })[] = []
    const add = (groupKey: string, key: string, accessibilityLabel: string) => {
      if (!targets.some((t) => t.key === key)) targets.push({ key, label: key, accessibilityLabel, groupKey })
    }
    if (mode === "athlete") {
      for (const group of athleteGroups) {
        const letter = rosterSummaryJumpLetter(group.name)
        add(group.athleteId, letter, `Athletes starting with ${letter}`)
      }
    } else {
      for (const group of eventGroups) {
        if (group.eventNumber) add(group.key, String(group.eventNumber), `Event ${group.eventNumber}, ${group.title}`)
      }
    }
    return targets
  }, [mode, athleteGroups, eventGroups])

  /**
   * Scrolls the screen so the group starts just below its top. The meet screen has no sticky
   * header inside its scroll view (the navigation header sits above it), so a small gap is all the
   * offset needed.
   */
  function jumpTo(key: string) {
    const scroll = scrollRef?.current
    const groupKey = jumpTargets.find((t) => t.key === key)?.groupKey
    const target = groupKey ? groupViews.current.get(groupKey) : undefined
    // The scroll view's content view, which group offsets are measured against (getInnerViewRef is
    // on ScrollView at runtime, though missing from its typings).
    const content = (
      scroll as unknown as { getInnerViewRef?: () => Parameters<View["measureLayout"]>[0] | null } | null
    )?.getInnerViewRef?.()
    if (!scroll || !target || content == null) return
    target.measureLayout(content, (_x, y) => scroll.scrollTo({ y: Math.max(0, y - spacing.sm), animated: true }))
  }

  /** The ref callback that registers a group's View for the jump bar. */
  const groupViewRef = (groupKey: string) => (view: View | null) => {
    if (view) groupViews.current.set(groupKey, view)
    else groupViews.current.delete(groupKey)
  }

  /** The list as it's shown — same mode, "My events" and search — for the PDF export. */
  function buildPdfRequest(): RosterSummaryPdfRequest {
    const q = query.trim()
    // "Heats by Event · Sunday Finals · My events".
    const heading = [
      `${title} by ${mode === "athlete" ? "Athlete" : "Event"}`,
      rosterSummaryScopeLabel(
        activeSession,
        roundFilterOn ? roundFilterLabel(hiddenRounds, availableRounds) : null
      ),
      genderFilter === "F" ? "Women" : genderFilter === "M" ? "Men" : null,
      mineOnly && viewerAthleteId ? "My events" : null,
      q ? `“${q}”` : null,
    ]
      .filter(Boolean)
      .join(" · ")
    // Entries and Heats exports lead with the order of events (the session's, when filtered to one).
    const orderOfEvents =
      title !== "Results" && eventOrder?.sessions.length
        ? { orderOfEvents: { session: activeSession ?? undefined } }
        : {}
    if (filtered.length === 0) return { heading, sections: [], ...orderOfEvents }
    const sections: RosterSummaryPdfSection[] =
      mode === "athlete"
        ? athleteGroups.map((group) => ({
            title: group.name,
            // Under an athlete, a relay is just the event — no list of its swimmers.
            rows: group.entries.map((entry) => ({
              ...pdfRow(entry, entryTitle(entry), group.athleteId, activeRound),
              legs: undefined,
              legSplits: undefined,
              legSubSplits: undefined,
            })),
          }))
        : eventGroups.map((group) => ({
            title: group.title,
            rows: group.entries.map((entry) =>
              pdfRow(
                entry,
                entry.entryType === "relay_team" ? entryTitle(entry) : entry.athleteName,
                undefined,
                activeRound
              )
            ),
          }))
    return { heading, sections, splitSections: mode !== "athlete", ...orderOfEvents }
  }

  /** The row whose heat & lane a coach is editing, with its rounds. */
  const [heatLaneEditing, setHeatLaneEditing] = useState<{
    entry: RosterSummaryEntry
    slots: HeatLaneSlot[]
  } | null>(null)
  /** A row's tap handler: opens the heat & lane editor for coaches, when there's anything to add. */
  function heatLanePress(entry: RosterSummaryEntry) {
    if (!canEdit) return undefined
    const slots = heatLaneSlots(entry, activeRound)
    return slots ? () => setHeatLaneEditing({ entry, slots }) : undefined
  }

  async function saveHeatLane(inputs: SetHeatLaneInput[]) {
    for (const input of inputs) await api.setMeetHeatLane(meetId, input)
    onHeatLaneSaved?.()
  }

  const [shareOpen, setShareOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState<"photos" | "pdf" | null>(null)
  const [done, setDone] = useState<"copy" | "photos" | null>(null)
  // The list as of opening the share sheet, rendered off-screen for the PNG while it's open.
  const [shareRequest, setShareRequest] = useState<RosterSummaryPdfRequest | null>(null)
  const exportCaptureRef = useRef<View>(null)
  const shareSheetDismissRef = useRef<(() => void) | null>(null)
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (doneTimeoutRef.current) clearTimeout(doneTimeoutRef.current)
    }
  }, [])

  function openShare() {
    setShareRequest(buildPdfRequest())
    setDone(null)
    setShareOpen(true)
  }

  /** "Copied" / "Saved" on the item for a moment. */
  function flashDone(which: "copy" | "photos") {
    setDone(which)
    if (doneTimeoutRef.current) clearTimeout(doneTimeoutRef.current)
    doneTimeoutRef.current = setTimeout(() => setDone(null), 2000)
  }

  /**
   * Closes the share sheet and waits for it to finish dismissing — iOS won't present
   * another native sheet over a modal that's still animating closed (same as relays).
   */
  function closeShareSheetAndWait(): Promise<void> {
    setShareOpen(false)
    if (Platform.OS !== "ios") return Promise.resolve()
    return new Promise((resolve) => {
      const finish = () => {
        shareSheetDismissRef.current = null
        clearTimeout(fallback)
        resolve()
      }
      const fallback = setTimeout(finish, 600)
      shareSheetDismissRef.current = finish
    })
  }

  async function copyText() {
    try {
      const request = shareRequest ?? buildPdfRequest()
      await Clipboard.setStringAsync(rosterSummaryText({ meetName, details, request }))
      flashDone("copy")
    } catch (err) {
      Alert.alert("Could not copy text", err instanceof Error ? err.message : "Something went wrong")
    }
  }

  async function saveToPhotos() {
    if (!exportCaptureRef.current) return
    setShareBusy("photos")
    try {
      if (!(await saveCaptureToPhotos(exportCaptureRef))) {
        Alert.alert("Permission needed", "Allow photo access in Settings to save roster summary images.")
        return
      }
      flashDone("photos")
    } catch (err) {
      Alert.alert("Could not save image", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  async function sharePdf() {
    setShareBusy("pdf")
    try {
      const file = await rosterSummaryPdfFile(meetId, meetName, shareRequest ?? buildPdfRequest())
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't open the share sheet.")
        return
      }
      await closeShareSheetAndWait()
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
    } catch (err) {
      Alert.alert("Could not share PDF", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  function toggleRound(kind: SummaryRoundKind) {
    setHiddenRounds((hidden) => {
      const next = new Set(hidden)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  // The filters in effect, as chips under the search field.
  // One chip per shown round, each hiding just its own.
  const roundChips = roundFilterOn ? roundFilterChips(hiddenRounds, availableRounds) : []
  const activeFilters: ActiveFilter[] = [
    ...(mineOnly && viewerAthleteId ? [{ key: "mine", label: "My events", clear: () => setMineOnly(false) }] : []),
    ...(activeSession ? [{ key: "session", label: activeSession, clear: () => setSessionFilter(null) }] : []),
    ...roundChips.map((chip) => ({
      key: `round-${chip.kind ?? "none"}`,
      label: chip.label,
      clear: () => setHiddenRounds(chip.hide),
    })),
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
  const listEmpty = mode === "athlete" ? athleteGroups.length === 0 : eventGroups.length === 0

  if (entries.length === 0) return null

  return (
    <Section>
      <SectionHeader
        title={title}
        right={
          <Pressable
            onPress={openShare}
            disabled={Boolean(shareBusy)}
            accessibilityRole="button"
            accessibilityLabel="Share roster summary"
            hitSlop={8}
            style={{ paddingVertical: spacing.xxs, paddingHorizontal: spacing.xs }}
          >
            {shareBusy ? (
              <ActivityIndicator size="small" color={c.text} />
            ) : (
              <Icon name="share" size={20} color={c.text} />
            )}
          </Pressable>
        }
      />
      <SegmentedToggle fill selectedIndex={mode === "athlete" ? 0 : 1} style={{ marginBottom: spacing.sm }}>
        {(
          [
            ["athlete", "By athlete"],
            ["event", "By event"],
          ] as const
        ).map(([value, label]) => (
          <SegmentedOption
            key={value}
            flex
            accessibilityLabel={label}
            selected={mode === value}
            onPress={() => setMode(value)}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: mode === value ? c.primaryContrast : c.textSecondary,
              }}
            >
              {label}
            </Text>
          </SegmentedOption>
        ))}
      </SegmentedToggle>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.xs }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextField
            accessibilityLabel="Search athletes or events"
            placeholder={[
              "Athlete or event",
              rosterSummaryScopeLabel(
                activeSession,
                roundFilterOn ? roundFilterLabel(hiddenRounds, availableRounds) : null
              ),
            ]
              .filter(Boolean)
              .join(" in ")}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            activeFilters.length > 0 ? `Filters, ${activeFilters.length} on` : "Filters"
          }
          style={({ pressed }) => ({
            height: 44,
            paddingHorizontal: spacing.sm,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: activeFilters.length > 0 ? c.accent : c.border,
            backgroundColor: pressed ? c.bgHover : c.bgContainer,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: activeFilters.length > 0 ? c.accent : c.text }}>
            {activeFilters.length > 0 ? `Filters · ${activeFilters.length}` : "Filters"}
          </Text>
        </Pressable>
      </View>
      {activeFilters.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: spacing.xs }}>
          {activeFilters.map((filter) => (
            <Chip
              key={filter.key}
              label={`${filter.label}  ×`}
              selected
              accessibilityLabel={`Remove filter: ${filter.label}`}
              onPress={filter.clear}
            />
          ))}
          {activeFilters.length > 1 ? (
            <Pressable
              onPress={clearFilters}
              accessibilityRole="button"
              hitSlop={8}
              style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: c.textSecondary }}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {scrollRef && !listEmpty ? <RosterSummaryJumpBar targets={jumpTargets} onJump={jumpTo} /> : null}

      {listEmpty ? (
        <EmptyState
          title={mineOnly && viewerAthleteId && !query.trim() ? "You have no events here" : "No matching entries"}
          body={activeFilters.length > 0 || query.trim() ? "Change the search or clear the filters to see more." : undefined}
        />
      ) : mode === "athlete" ? (
        athleteGroups.map((group) => (
          <View key={group.athleteId} ref={groupViewRef(group.athleteId)} collapsable={false} style={{ marginBottom: spacing.md }}>
            <Body
              style={{
                fontWeight: "700",
                marginBottom: spacing.xs,
                color: viewerAthleteId && group.athleteId === viewerAthleteId ? c.accent : undefined,
              }}
            >
              <RosterNameText name={group.name} mutedColor={c.textSecondary} />
            </Body>
            {group.entries.map((entry, index) => (
              <ListRow
                key={`${entry.athleteId}-${entry.event}-${entry.relayLetter ?? ""}-${index}`}
                title={entryTitle(entry)}
                subtitle={entrySubtitle(entry, "athlete", true, group.athleteId, true, activeRound)}
                onPress={heatLanePress(entry)}
              />
            ))}
          </View>
        ))
      ) : (
        eventGroups.map((group) => (
          <View key={group.key} ref={groupViewRef(group.key)} collapsable={false} style={{ marginBottom: spacing.md }}>
            <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
              {group.title}
            </Body>
            {group.entries.map((entry, index) => (
              <ListRow
                key={`${group.key}-${entry.athleteId}-${index}`}
                title={
                  entry.entryType === "relay_team"
                    ? entryTitle(entry)
                    : splitRosterName(entry.athleteName).name
                }
                titleAdornment={
                  entry.entryType !== "relay_team" &&
                  splitRosterName(entry.athleteName).preferred ? (
                    <Text style={{ fontSize: 16, color: c.textSecondary }}>
                      ({splitRosterName(entry.athleteName).preferred})
                    </Text>
                  ) : undefined
                }
                subtitle={entrySubtitle(entry, "event", true, undefined, true, activeRound)}
                onPress={heatLanePress(entry)}
              />
            ))}
          </View>
        ))
      )}
      <Muted>
        {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
      </Muted>

      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        {viewerAthleteId ? (
          <FilterGroup label="Show">
            <Chip label="Everyone" selected={!mineOnly} onPress={() => setMineOnly(false)} />
            <Chip label="My events" selected={mineOnly} onPress={() => setMineOnly(true)} />
          </FilterGroup>
        ) : null}
        <FilterGroup label="Gender">
          {(
            [
              ["all", "All"],
              ["F", "Women"],
              ["M", "Men"],
            ] as const
          ).map(([value, label]) => (
            <Chip key={value} label={label} selected={genderFilter === value} onPress={() => setGenderFilter(value)} />
          ))}
        </FilterGroup>
        {sessions.length > 0 ? (
          <FilterGroup label="Session">
            {[null, ...sessions].map((session) => (
              <Chip
                key={session ?? "all"}
                label={session ?? "All sessions"}
                selected={activeSession === session}
                onPress={() => setSessionFilter(session)}
              />
            ))}
          </FilterGroup>
        ) : null}
        {roundFilterOn ? (
          <FilterGroup label="Rounds">
            {SUMMARY_ROUNDS.filter((r) => availableRounds.includes(r.kind)).map((r) => (
              <Chip
                key={r.kind}
                label={r.label}
                selected={!hiddenRounds.has(r.kind)}
                onPress={() => toggleRound(r.kind)}
              />
            ))}
          </FilterGroup>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Muted>
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
          </Muted>
          {activeFilters.length > 0 ? (
            <Pressable onPress={clearFilters} accessibilityRole="button" hitSlop={8}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: c.accent }}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>
      </BottomSheet>

      <ActionSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onDismiss={() => shareSheetDismissRef.current?.()}
        title="Share roster summary"
        groups={[
          [
            {
              key: "copy",
              label: done === "copy" ? "Copied" : "Copy as text",
              icon: <Icon name={done === "copy" ? "check" : "copy"} size={20} color={c.text} />,
              disabled: Boolean(shareBusy),
              onPress: () => void copyText(),
            },
            {
              key: "photos",
              label: done === "photos" ? "Saved to Photos" : "Save to Photos",
              icon: <Icon name={done === "photos" ? "check" : "image"} size={20} color={c.text} />,
              busy: shareBusy === "photos",
              disabled: Boolean(shareBusy) && shareBusy !== "photos",
              onPress: () => void saveToPhotos(),
            },
            {
              key: "pdf",
              label: "Share PDF",
              icon: <Icon name="fileText" size={20} color={c.text} />,
              busy: shareBusy === "pdf",
              disabled: Boolean(shareBusy) && shareBusy !== "pdf",
              onPress: () => void sharePdf(),
            },
          ] satisfies ActionSheetItem[],
        ]}
      />

      {heatLaneEditing ? (
        <HeatLaneSheet
          visible
          onClose={() => setHeatLaneEditing(null)}
          title={
            heatLaneEditing.entry.entryType === "relay_team"
              ? entryTitle(heatLaneEditing.entry)
              : `${heatLaneEditing.entry.event} · ${splitRosterName(heatLaneEditing.entry.athleteName).name}`
          }
          row={heatLaneRow(heatLaneEditing.entry)}
          slots={heatLaneEditing.slots}
          onSave={saveHeatLane}
        />
      ) : null}

      {/* Off-screen mirror captured to PNG while the share sheet is open — never shown in the layout. */}
      {shareOpen && shareRequest ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: -10000 }}>
          <RosterSummaryExportCapture
            ref={exportCaptureRef}
            meetName={meetName}
            details={details}
            iconUrl={iconUrl}
            request={shareRequest}
          />
        </View>
      ) : null}
    </Section>
  )
}

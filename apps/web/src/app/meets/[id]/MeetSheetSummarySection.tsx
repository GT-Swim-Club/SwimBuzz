"use client"

import { useEffect, useState, Fragment } from "react"
import Link from "next/link"
import type { MeetResultEntry, SheetEntry, SheetSummary } from "@/lib/meet/meet-sheet-summary"
import {
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
  mergeMeetResultEntries,
  mergeSheetSummaries,
  relayLeadoffsFromSplits,
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
import { formatSeedTimeDelta, parseTime } from "@/lib/utils"
import { athletePath } from "@/lib/slug"
import { LedgerIcon } from "@/components/meet/Ledger"
import EditMeetSwimButton from "./EditMeetSwimButton"
import EditSheetSeedButton from "./EditSheetSeedButton"
import RemoveRosterOnlyButton from "./RemoveRosterOnlyButton"
import { EditRelayButton } from "./MeetRelayEditor"
import MeetAddMenu from "./MeetAddMenu"
import { MenuDivider, MenuItem, menuPanel } from "./MeetMenu"
import SummaryRow, { EventBadge, type RowDisplay, type RowDensity, type RowResult } from "./SummaryRow"
import type { DetailRound, SwimDetail } from "./SwimDetailModal"

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
  if (entry.resultRound === "P") return undefined
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

  if (entry.isRelayLeadoff && entry.relayLeadoffTime) {
    return {
      label: "Leadoff",
      time: entry.relayLeadoffTime,
      place: entry.resultPlace,
      seed: entry.seedTime,
    }
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
  if (entry.entryType === "relay_team" || entry.isRelayLeadoff) return []

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

type AthleteRecord = {
  id: string
  slug?: string | null
  name: string
  gender?: "M" | "F"
  image?: string | null
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
}) {
  const [relayEditOpen, setRelayEditOpen] = useState(false)
  const isRelay = entry.entryType === "relay_team"
  const athleteRecord = athletes?.find((a) => a.id === entry.athleteId)
  const eventNumber = resolveDisplayEventNumber(entry, athleteGenders, eventNumberOptions)
  const compact = display.density === "compact"
  const res = rowRoundResult(entry, allEntries)
  const podiumPlace = finalsPodiumPlace(entry)
  const relayLetter = isRelay ? `Relay ${displayRelayLetter(entry.relayLetter)}` : undefined

  const heat = formatHeat(entry)
  const lane = isRelay ? relayLane(entry) : individualLane(entry)
  const heatLane =
    [heat, lane != null ? `Lane ${lane}` : null, entry.startTime].filter(Boolean).join(" · ") || null

  const tags = !isRelay ? displayMeetResultTags(entry.resultTags ?? "") : null
  const sub = [entry.isRelayLeadoff ? "Relay leadoff" : null, tags].filter(Boolean).join(" · ")

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
          lane,
          splits: [],
        },
      ],
      relaySwimmers: [...(entry.relaySwimmers ?? [])]
        .sort((a, b) => a.leg - b.leg)
        .map((s) => ({ name: s.name, split: sanitizeRelaySplitTime(s.splitTime) })),
      coachNote,
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
      subLine: [
        entry.isRelayLeadoff ? ["Relay leadoff", entry.relayLeadoffSource].filter(Boolean).join(" · ") : null,
        detailRounds.length > 1 ? detailRounds.map((r) => r.label).join(" · ") : detailRounds[0].label,
      ]
        .filter(Boolean)
        .join(" · "),
      rounds: detailRounds,
    }
  }

  const editButton =
    canEdit && meetId ? (
      isRelay ? (
        <EditRelayButton
          meetId={meetId}
          athletes={athletes ?? []}
          entry={entry}
          open={relayEditOpen}
          onOpenChange={setRelayEditOpen}
        />
      ) : isRosterOnlySheetEntry(entry) ? (
        <RemoveRosterOnlyButton
          meetId={meetId}
          athleteId={entry.athleteId}
          athleteName={entry.athleteName}
        />
      ) : entry.manual &&
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
        (entry.manual === true ||
          editableSeedKeys.has(`${entry.athleteId}|${normalizeEventName(entry.event)}`)) ? (
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

  return (
    <SummaryRow
      id={entry.swimId ? `swim-${entry.swimId}` : undefined}
      display={display}
      eventNumber={!eventView && eventNumber > 0 ? eventNumber : undefined}
      avatar={
        eventView && !isRelay ? (
          <AthleteAvatar image={athleteRecord?.image} name={entry.athleteName} compact={compact} />
        ) : undefined
      }
      label={eventView ? (isRelay ? relayLetter : entry.athleteName) : eventName}
      sub={sub || undefined}
      team={!eventView ? relayLetter : undefined}
      round={entry.rosterOnly || entry.isRelayLeadoff ? null : res.label}
      heatLane={heatLane}
      note={coachNote}
      result={result}
      detail={detail}
      trailing={editButton}
      onEditRelay={isRelay && canEdit && meetId ? () => setRelayEditOpen(true) : undefined}
    />
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
  /** Athletes attending this meet, including roster-only and signup entries. */
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

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [settingsOpen])

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

  const leadoffResults = mergeMeetResultEntries(
    results ?? [],
    relayLeadoffsFromSplits(relayResults)
  )

  const summary = mergeSheetSummaries(
    psychSummary,
    heatSummary,
    leadoffResults,
    relayResults,
    entriesSummary,
    finalsHeatSummary
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
            e.athleteId === viewerAthleteId && (e.entryType === "individual" || e.isRelayLeadoff)
        )
        .sort(compareIndividualEntries)
    : []
  const myRelays = viewerAthleteId
    ? relays
        .filter((e) => e.relaySwimmers?.some((s) => s.athleteId === viewerAthleteId))
        .sort((a, b) => compareRelayEvents(a.event, b.event))
    : []
  const myEntries = [...myIndividualEntries, ...myRelays]
  const otherGrouped = viewerAthleteId
    ? grouped.filter((a) => a.entries[0]?.athleteId !== viewerAthleteId)
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
  const filteredRelays = relays.filter(
    (entry) =>
      matchesGenderFilter(entry) &&
      (!q ||
        entry.relaySwimmers?.some((swimmer) => swimmer.name.toLowerCase().includes(q)) ||
        entry.event.toLowerCase().includes(q))
  )
  const filteredOtherGrouped = otherGrouped
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

  // For the "by event" view: use the de-duped relay list (same as the by-athlete relay section)
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
    const genderLabel =
      gender === "F" ? "Women's" : gender === "M" ? "Men's" : gender === "X" ? "Mixed" : ""
    const title = `${genderLabel} ${entry.event}`.trim()
    // Use the eventNumber, gender, and event name for unique grouping
    const key = `${eventNumber}|${title}`
    if (!acc.has(key)) {
      acc.set(key, { key, title, eventNumber, entries: [] })
    }
    acc.get(key)!.entries.push(entry)
    return acc
  }, new Map<string, { key: string; title: string; eventNumber: number; entries: SummaryEntry[] }>())

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
    filteredMyEntries.length > 0 || filteredRelays.length > 0 || filteredOtherGrouped.length > 0
  const filteredRosterAthletes = rosterAthletes.filter(
    (athlete) =>
      (genderFilter === "all" || athlete.gender === genderFilter) &&
      (!q || athlete.name.toLowerCase().includes(q))
  )
  const hasContent =
    viewMode === "roster"
      ? filteredRosterAthletes.length > 0
      : viewByEvent
        ? sortedEventGroups.length > 0
        : hasSummaryContent

  const eventCountByAthlete = new Map<string, number>()
  for (const entry of displayEntries) {
    if (entry.entryType === "relay_team" || entry.rosterOnly || entry.isRelayLeadoff) continue
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

  function renderRelayGroup(title: string | null, entries: SummaryEntry[], prefix: string) {
    if (entries.length === 0) return null
    return (
      <Fragment key={prefix}>
        {title ? (
          <li className="border-t border-border px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.025em] text-foreground-secondary">
            {title}
          </li>
        ) : null}
        {entries.map((entry, i) => (
          <SummaryEntryRow
            key={`${prefix}-${entryRowKey(entry, i, athleteGenders)}`}
            entry={entry}
            {...rowProps}
          />
        ))}
      </Fragment>
    )
  }

  const viewerRecord = viewerAthleteId ? athletes.find((a) => a.id === viewerAthleteId) : undefined
  const addMenuVisible = canEdit && meetId

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 pb-1">
        <input
          type="search"
          aria-label={viewMode === "roster" ? "Search athletes" : "Search athletes or events"}
          placeholder={
            viewMode === "roster" ? "Search athletes..." : "Search athletes or events..."
          }
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
                        {athlete.name}
                      </span>
                      {isMe ? (
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
                          You
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
            <div className="overflow-hidden rounded-xl border border-primary bg-accent/[0.04] shadow-sm">
              <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent">
                <AthleteAvatar
                  image={viewerRecord?.image}
                  name={athleteNames.get(viewerAthleteId!) || "My Profile"}
                />
                <span>{athleteNames.get(viewerAthleteId!)}</span>
              </div>
              <ul className="border-t border-border-subtle">
                {filteredMyEntries.map((entry, i) => (
                  <SummaryEntryRow
                    key={`mine-${entryRowKey(entry, i, athleteGenders)}`}
                    entry={entry}
                    {...rowProps}
                  />
                ))}
              </ul>
            </div>
          ) : null}
          {filteredRelays.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="px-4 py-2.5 text-sm font-medium text-foreground">Relays</div>
              <ul>
                {renderRelayGroup(
                  "Women's",
                  filteredRelays.filter((e) => effectiveRelayGender(e, athleteGenders) === "F"),
                  "womens"
                )}
                {renderRelayGroup(
                  "Men's",
                  filteredRelays.filter((e) => effectiveRelayGender(e, athleteGenders) === "M"),
                  "mens"
                )}
                {renderRelayGroup(
                  "Mixed",
                  filteredRelays.filter((e) => effectiveRelayGender(e, athleteGenders) === "X"),
                  "mixed"
                )}
                {renderRelayGroup(
                  null,
                  filteredRelays.filter((e) => effectiveRelayGender(e, athleteGenders) === ""),
                  "other"
                )}
              </ul>
            </div>
          ) : null}
          {filteredOtherGrouped.map((athleteGroup) => {
            const events = [...athleteGroup.entries].sort(compareIndividualEntries)
            const athleteData = athletes.find((a) => a.id === athleteGroup.entries[0]?.athleteId)
            return (
              <div
                key={athleteGroup.name}
                className="overflow-hidden rounded-xl border border-border bg-background"
              >
                <Link
                  href={athletePath(athleteData?.slug ?? athleteGroup.entries[0]?.athleteId ?? "")}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  <AthleteAvatar image={athleteData?.image} name={athleteGroup.name} />
                  <span>{athleteGroup.name}</span>
                </Link>
                <ul className="border-t border-border-subtle">
                  {events.map((entry, i) => (
                    <SummaryEntryRow
                      key={`${athleteGroup.entries[0]?.athleteId}-${entryRowKey(entry, i, athleteGenders)}`}
                      entry={entry}
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

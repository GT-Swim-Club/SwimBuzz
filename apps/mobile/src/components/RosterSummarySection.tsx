import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import * as MediaLibrary from "expo-media-library"
import * as Sharing from "expo-sharing"
import { File, Paths } from "expo-file-system"
import { captureRef } from "react-native-view-shot"
import {
  eventGenderWord,
  roundFilterIncludes,
  roundFilterLabel,
  rosterSummaryPdfFilename,
  rosterSummaryScopeLabel,
  rosterSummaryText,
  rosterSummarySessions,
  rosterSummaryTitle,
  sessionIncludes,
  sessionRound,
  splitRosterName,
  SUMMARY_ROUNDS,
  type MeetHeaderDetails,
  type MeetSessionOrder,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfSection,
  type SessionRound,
  type SummaryRoundKind,
} from "@swimbuzz/shared"
import {
  ActionSheet,
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
import { API_URL, getAccessToken } from "../lib/api"
import { Icon } from "./Icon"
import { RosterSummaryExportCapture } from "./RosterSummaryExportCapture"

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
  /** Heat-sheet round text ("Timed Finals"). */
  round?: string
  resultRound?: string
  resultTime?: string
  prelimTime?: string
  finalTime?: string
  resultPlace?: number
  prelimPlace?: number
  finalPlace?: number
  resultStatus?: string
  /** Swim-off (tie-breaker) result row. */
  isSwimOff?: boolean
  /** A relay leg 1 split as its own row; shown on the relay's row instead. */
  isRelayLeadoff?: boolean
  alternate?: boolean
  rosterOnly?: boolean
  relayLetter?: string | null
  relayRound?: string
  gender?: string
  relaySwimmers?: Array<{
    leg: number
    name: string
    athleteId?: string
    splitTime?: string
  }>
}

/** Heat & lane — for that round's swim when the view is filtered to a prelims or finals session. */
function formatHeatLane(entry: RosterSummaryEntry, round?: SessionRound | null): string | null {
  if (entry.alternate) return "Alt"
  const { heat, heatTotal, lane } = heatLaneFor(entry, round)
  const parts: string[] = []
  if (heat != null && heat > 0) {
    parts.push(heatTotal != null ? `H${heat}/${heatTotal}` : `H${heat}`)
  }
  if (lane != null && lane > 0) parts.push(`L${lane}`)
  return parts.length ? parts.join(" · ") : null
}

function heatLaneFor(entry: RosterSummaryEntry, round?: SessionRound | null) {
  const heat =
    round === "F"
      ? entry.finalHeat ?? entry.heat ?? null
      : round === "P"
        ? entry.prelimHeat ?? entry.heat ?? null
        : entry.heat ?? entry.finalHeat ?? entry.prelimHeat ?? null
  const heatTotal =
    round === "F"
      ? entry.finalHeatTotal ?? entry.heatTotal
      : round === "P"
        ? entry.prelimHeatTotal ?? entry.heatTotal
        : entry.heatTotal
  const lane =
    round === "F"
      ? entry.finalLane ?? entry.lane ?? null
      : round === "P"
        ? entry.prelimLane ?? entry.lane ?? null
        : entry.lane ?? entry.finalLane ?? entry.prelimLane ?? null
  return { heat, heatTotal, lane }
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
 * The rounds an entry stands for — mobile entries carry prelims and finals on one row. Empty when
 * unknown (a seed before any heat sheet).
 */
function entryRoundKinds(entry: RosterSummaryEntry): SummaryRoundKind[] {
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

function entryTitle(entry: RosterSummaryEntry): string {
  if (entry.entryType === "relay_team") {
    const letter = entry.relayLetter ? ` ${entry.relayLetter}` : ""
    const round = entry.relayRound ? ` (${entry.relayRound})` : ""
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

/** The leg an athlete swam on a relay and their split, e.g. "Leg 1 split 25.31". */
function relayLegLabel(entry: RosterSummaryEntry, athleteId: string | undefined): string | null {
  if (entry.entryType !== "relay_team" || !athleteId) return null
  const swimmer = entry.relaySwimmers?.find((s) => s.athleteId === athleteId)
  if (!swimmer) return null
  const split = swimmer.splitTime?.trim()
  return split && /\d/.test(split) ? `Leg ${swimmer.leg} split ${split}` : `Leg ${swimmer.leg}`
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
    mode === "event" ? entry.athleteName : relayLegLabel(entry, athleteId),
    withHeatLane ? formatHeatLane(entry, round) : null,
    formatTimes(entry),
    formatPlace(entry) ? `Place ${formatPlace(entry)}` : null,
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
  // The athlete's leg rides beside the relay's name; their split leads the line below.
  const swimmer =
    isRelay && athleteId ? entry.relaySwimmers?.find((s) => s.athleteId === athleteId) : undefined
  const legNumber = swimmer?.leg
  const split = swimmer?.splitTime?.trim()
  const relayTitleFrom = (event: string) =>
    [event, entry.relayLetter, entry.relayRound ? `(${entry.relayRound})` : null]
      .filter(Boolean)
      .join(" ")
  const relayEvent = entry.event.replace(/\s+Relay$/i, "")
  return {
    label: isRelay ? relayTitleFrom(relayEvent) : title,
    // Spelled out ("200 Medley Relay A (P)") where the line has room.
    fullLabel: isRelay ? relayTitleFrom(`${relayEvent} Relay`) : undefined,
    sub: legNumber ? `Leg ${legNumber}` : undefined,
    meta:
      [
        split && /\d/.test(split) ? `Split ${split}` : null,
        entrySubtitle(entry, "athlete", false, undefined, false),
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    heatLane: formatHeatLane(entry, round)?.replace("/", " of ") ?? undefined,
    legs: isRelay ? relayLegNames(entry) : undefined,
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
  /** A packet session's label, or null for every session. */
  const [sessionFilter, setSessionFilter] = useState<string | null>(null)
  const [hiddenRounds, setHiddenRounds] = useState<ReadonlySet<SummaryRoundKind>>(new Set())

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
  }, [entries, mineOnly, query, viewerAthleteId, roundFilterOn, hiddenRounds, availableRounds, activeSession, eventOrder])

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
    return [...map.values()]
      .map((group) => ({ ...group, entries: group.entries.slice().sort((a, b) => order(a) - order(b)) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered, mineOnly, viewerAthleteId])

  const eventGroups = useMemo(() => {
    const map = new Map<string, RosterSummaryEntry[]>()
    for (const entry of filtered) {
      const key = `${entry.event}|${entry.gender ?? ""}|${entry.entryType ?? "individual"}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        // "Women 200 Medley Relay"
        title: list[0] ? `${eventGenderWord(list[0].gender) ?? ""} ${list[0].event}`.trim() : key,
        entries: sortEventEntries(list, activeRound),
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [filtered, activeRound])

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
      mineOnly && viewerAthleteId ? "My events" : null,
      q ? `“${q}”` : null,
    ]
      .filter(Boolean)
      .join(" · ")
    if (filtered.length === 0) return { heading, sections: [] }
    const sections: RosterSummaryPdfSection[] =
      mode === "athlete"
        ? athleteGroups.map((group) => ({
            title: group.name,
            // Under an athlete, a relay is just the event — no list of its swimmers.
            rows: group.entries.map((entry) => ({
              ...pdfRow(entry, entryTitle(entry), group.athleteId, activeRound),
              legs: undefined,
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
    return { heading, sections, splitSections: mode !== "athlete" }
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
      const permission = await MediaLibrary.requestPermissionsAsync(true)
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo access in Settings to save roster summary images.")
        return
      }
      const uri = await captureRef(exportCaptureRef, { format: "png", quality: 1, result: "tmpfile" })
      await MediaLibrary.saveToLibraryAsync(uri)
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
      const token = await getAccessToken()
      const request = shareRequest ?? buildPdfRequest()
      const res = await fetch(
        `${API_URL}/api/meets/${encodeURIComponent(meetId)}/roster-summary/pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(request),
        }
      )
      if (!res.ok) throw new Error("Could not create PDF")
      const bytes = new Uint8Array(await res.arrayBuffer())
      const file = new File(Paths.cache, rosterSummaryPdfFilename(meetName, request))
      if (file.exists) file.delete()
      file.write(bytes)
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
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: spacing.sm,
        }}
      >
        <Chip
          label="By athlete"
          selected={mode === "athlete"}
          onPress={() => setMode("athlete")}
        />
        <Chip
          label="By event"
          selected={mode === "event"}
          onPress={() => setMode("event")}
        />
        {viewerAthleteId ? (
          <Chip
            label="My events"
            selected={mineOnly}
            onPress={() => setMineOnly((v) => !v)}
          />
        ) : null}
      </View>
      {sessions.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm }}>
          {[null, ...sessions].map((session) => (
            <Chip
              key={session ?? "all"}
              label={session ?? "All sessions"}
              selected={activeSession === session}
              onPress={() => setSessionFilter(session)}
            />
          ))}
        </View>
      ) : null}
      {roundFilterOn ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm }}>
          {SUMMARY_ROUNDS.filter((r) => availableRounds.includes(r.kind)).map((r) => (
            <Chip
              key={r.kind}
              label={r.label}
              selected={!hiddenRounds.has(r.kind)}
              onPress={() => toggleRound(r.kind)}
            />
          ))}
        </View>
      ) : null}
      <TextField
        label="Search"
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

      {filtered.length === 0 ? (
        <EmptyState title="No matching entries" />
      ) : mode === "athlete" ? (
        athleteGroups.map((group) => (
          <View key={group.athleteId} style={{ marginBottom: spacing.md }}>
            <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
              <RosterNameText name={group.name} mutedColor={c.textSecondary} />
            </Body>
            {group.entries.map((entry, index) => (
              <ListRow
                key={`${entry.athleteId}-${entry.event}-${entry.relayLetter ?? ""}-${index}`}
                title={entryTitle(entry)}
                subtitle={entrySubtitle(entry, "athlete", true, group.athleteId, true, activeRound)}
              />
            ))}
          </View>
        ))
      ) : (
        eventGroups.map((group) => (
          <View key={group.key} style={{ marginBottom: spacing.md }}>
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
              />
            ))}
          </View>
        ))
      )}
      <Muted>
        {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
      </Muted>

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

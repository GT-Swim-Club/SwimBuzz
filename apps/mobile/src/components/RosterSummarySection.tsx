import { useMemo, useState } from "react"
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native"
import * as Sharing from "expo-sharing"
import { File, Paths } from "expo-file-system"
import {
  eventGenderWord,
  rosterSummaryPdfFilename,
  rosterSummaryTitle,
  splitRosterName,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfSection,
} from "@swimbuzz/shared"
import {
  Body,
  Chip,
  EmptyState,
  ListRow,
  Muted,
  Section,
  SectionHeader,
  TextField,
  usePalette,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { API_URL, getAccessToken } from "../lib/api"
import { Icon } from "./Icon"

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
  prelimLane?: number
  finalHeat?: number
  finalLane?: number
  resultTime?: string
  prelimTime?: string
  finalTime?: string
  resultPlace?: number
  prelimPlace?: number
  finalPlace?: number
  resultStatus?: string
  /** Swim-off (tie-breaker) result row. */
  isSwimOff?: boolean
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

function formatHeatLane(entry: RosterSummaryEntry): string | null {
  if (entry.alternate) return "Alt"
  const heat =
    entry.heat ??
    entry.finalHeat ??
    entry.prelimHeat ??
    null
  const lane =
    entry.lane ?? entry.finalLane ?? entry.prelimLane ?? null
  const parts: string[] = []
  if (heat != null && heat > 0) {
    parts.push(
      entry.heatTotal != null
        ? `H${heat}/${entry.heatTotal}`
        : `H${heat}`
    )
  }
  if (lane != null && lane > 0) parts.push(`L${lane}`)
  return parts.length ? parts.join(" · ") : null
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

function entrySubtitle(
  entry: RosterSummaryEntry,
  mode: "athlete" | "event",
  withLegs = true
): string {
  const bits = [
    mode === "event" ? entry.athleteName : null,
    formatHeatLane(entry),
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
 * A list row as a PDF row: title and subtitle, plus relay legs. The subtitle leaves out the
 * athlete's name, which the label (or section title) already carries. Relay titles are compact:
 * "200 Medley A (P)".
 */
function pdfRow(entry: RosterSummaryEntry, title: string) {
  const isRelay = entry.entryType === "relay_team"
  const relayTitle = [
    entry.event.replace(/\s+Relay$/i, ""),
    entry.relayLetter,
    entry.relayRound ? `(${entry.relayRound})` : null,
  ]
    .filter(Boolean)
    .join(" ")
  return {
    label: isRelay ? relayTitle : title,
    meta: entrySubtitle(entry, "athlete", false) || undefined,
    legs: isRelay ? relayLegNames(entry) : undefined,
  }
}

export function RosterSummarySection({
  entries,
  viewerAthleteId,
  meetId,
  meetName,
  hasHeatSheet,
}: {
  entries: RosterSummaryEntry[]
  viewerAthleteId?: string | null
  meetId: string
  meetName: string
  /** A prelims or finals heat sheet is on the meet. */
  hasHeatSheet: boolean
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
  const [sharing, setSharing] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((entry) => {
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
  }, [entries, mineOnly, query, viewerAthleteId])

  // Each relay sits in the group of every swimmer on it (only the viewer's with "My events"),
  // in event order with their individual events — there's no separate relays list.
  const athleteGroups = useMemo(() => {
    const map = new Map<string, { name: string; entries: RosterSummaryEntry[] }>()
    const groupFor = (athleteId: string, name: string) => {
      let group = map.get(athleteId)
      if (!group) map.set(athleteId, (group = { name, entries: [] }))
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
        entries: list.slice().sort((a, b) => {
          const ah = a.heat ?? a.finalHeat ?? a.prelimHeat ?? 999
          const bh = b.heat ?? b.finalHeat ?? b.prelimHeat ?? 999
          if (ah !== bh) return ah - bh
          const al = a.lane ?? a.finalLane ?? a.prelimLane ?? 99
          const bl = b.lane ?? b.finalLane ?? b.prelimLane ?? 99
          return al - bl
        }),
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [filtered])

  /** The list as it's shown — same mode, "My events" and search — for the PDF export. */
  function buildPdfRequest(): RosterSummaryPdfRequest {
    const q = query.trim()
    const heading = [
      `${title} by ${mode === "athlete" ? "Athlete" : "Event"}`,
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
            rows: group.entries.map((entry) => ({ ...pdfRow(entry, entryTitle(entry)), legs: undefined })),
          }))
        : eventGroups.map((group) => ({
            title: group.title,
            rows: group.entries.map((entry) =>
              pdfRow(entry, entry.entryType === "relay_team" ? entryTitle(entry) : entry.athleteName)
            ),
          }))
    return { heading, sections, splitSections: mode !== "athlete" }
  }

  async function sharePdf() {
    setSharing(true)
    try {
      const token = await getAccessToken()
      const request = buildPdfRequest()
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
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
    } catch (err) {
      Alert.alert("Could not share PDF", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSharing(false)
    }
  }

  if (entries.length === 0) return null

  return (
    <Section>
      <SectionHeader
        title={title}
        right={
          <Pressable
            onPress={() => void sharePdf()}
            disabled={sharing}
            accessibilityRole="button"
            accessibilityLabel="Share roster summary PDF"
            hitSlop={8}
            style={{ paddingVertical: spacing.xxs, paddingHorizontal: spacing.xs }}
          >
            {sharing ? (
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
      <TextField
        label="Search"
        placeholder="Athlete or event"
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
          <View key={group.name} style={{ marginBottom: spacing.md }}>
            <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
              <RosterNameText name={group.name} mutedColor={c.textSecondary} />
            </Body>
            {group.entries.map((entry, index) => (
              <ListRow
                key={`${entry.athleteId}-${entry.event}-${entry.relayLetter ?? ""}-${index}`}
                title={entryTitle(entry)}
                subtitle={entrySubtitle(entry, "athlete")}
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
                subtitle={entrySubtitle(entry, "event")}
              />
            ))}
          </View>
        ))
      )}
      <Muted>
        {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
      </Muted>
    </Section>
  )
}

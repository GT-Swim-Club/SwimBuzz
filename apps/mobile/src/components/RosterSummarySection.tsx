import { useMemo, useState } from "react"
import { View } from "react-native"
import {
  Body,
  Chip,
  EmptyState,
  ListRow,
  Muted,
  Section,
  TextField,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"

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
    parts.push(entry.resultTime)
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

function entrySubtitle(entry: RosterSummaryEntry, mode: "athlete" | "event"): string {
  const bits = [
    mode === "event" ? entry.athleteName : null,
    formatHeatLane(entry),
    formatTimes(entry),
    formatPlace(entry) ? `Place ${formatPlace(entry)}` : null,
  ].filter(Boolean)
  if (entry.entryType === "relay_team" && entry.relaySwimmers?.length) {
    bits.push(
      entry.relaySwimmers
        .slice()
        .sort((a, b) => a.leg - b.leg)
        .map((s) => s.name)
        .join(", ")
    )
  }
  return bits.join(" · ")
}

export function RosterSummarySection({
  entries,
  viewerAthleteId,
}: {
  entries: RosterSummaryEntry[]
  viewerAthleteId?: string | null
}) {
  const [mode, setMode] = useState<"athlete" | "event">("athlete")
  const [query, setQuery] = useState("")
  const [mineOnly, setMineOnly] = useState(false)

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

  const athleteGroups = useMemo(() => {
    const map = new Map<string, { name: string; entries: RosterSummaryEntry[] }>()
    for (const entry of filtered) {
      if (entry.entryType === "relay_team") continue
      if (!map.has(entry.athleteId)) {
        map.set(entry.athleteId, { name: entry.athleteName, entries: [] })
      }
      map.get(entry.athleteId)!.entries.push(entry)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered])

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
        title: list[0]?.event ?? key,
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

  const relays = useMemo(
    () => filtered.filter((e) => e.entryType === "relay_team"),
    [filtered]
  )

  if (entries.length === 0) return null

  return (
    <Section title="Roster summary">
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
        <>
          {athleteGroups.map((group) => (
            <View key={group.name} style={{ marginBottom: spacing.md }}>
              <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
                {group.name}
              </Body>
              {group.entries.map((entry, index) => (
                <ListRow
                  key={`${entry.athleteId}-${entry.event}-${index}`}
                  title={entryTitle(entry)}
                  subtitle={entrySubtitle(entry, "athlete")}
                />
              ))}
            </View>
          ))}
          {relays.length > 0 ? (
            <View style={{ marginBottom: spacing.md }}>
              <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
                Relays
              </Body>
              {relays.map((entry, index) => (
                <ListRow
                  key={`relay-${entry.event}-${entry.relayLetter}-${index}`}
                  title={entryTitle(entry)}
                  subtitle={entrySubtitle(entry, "event")}
                />
              ))}
            </View>
          ) : null}
        </>
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
                    : entry.athleteName
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

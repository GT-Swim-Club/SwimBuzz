import { useEffect, useState } from "react"
import { Alert, Image, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DEFAULT_TIME_ZONE, formatFullDate, formatMeetDateRange, formatTime, isHtmlEmpty, zonedDayKey, type IconName } from "@swimbuzz/shared"
import {
  Body,
  Button,
  Chip,
  ErrorBlock,
  ListRow,
  LoadingBlock,
  MetaRow,
  Muted,
  Screen,
  ScrollView,
  Section,
  SubtitleSegments,
  TextField,
  Title,
  usePalette,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import {
  EventOrderSection,
  isEventOrder,
} from "../../../src/components/EventOrderSection"
import {
  RosterSummarySection,
  type RosterSummaryEntry,
} from "../../../src/components/RosterSummarySection"
import { FilePreviewModal } from "../../../src/components/FilePreviewModal"
import { api } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { FormattedText } from "../../../src/components/FormattedText"
import { Icon } from "../../../src/components/Icon"
import { RelativeDateText } from "../../../src/components/RelativeDateText"
import { ZonedTimeText } from "../../../src/components/ZonedTimeText"
import { isExternalUrl } from "../../../src/lib/href"

type ResourceLink = { label: string; url: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function photoLinksFromMeet(meet: Record<string, unknown>): ResourceLink[] {
  const photos = meet.photos
  const links: ResourceLink[] = []

  if (Array.isArray(photos)) {
    photos.forEach((item, index) => {
      if (typeof item === "string" && isExternalUrl(item)) {
        links.push({ label: `Photo ${index + 1}`, url: item.trim() })
        return
      }
      const row = asRecord(item)
      if (!row) return
      const url = typeof row.url === "string" ? row.url.trim() : ""
      if (!isExternalUrl(url)) return
      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : `Photo ${index + 1}`
      links.push({ label: name, url })
    })
    return links
  }

  const obj = asRecord(photos)
  if (!obj) return links

  if (Array.isArray(obj.links)) {
    obj.links.forEach((item, index) => {
      if (typeof item === "string" && isExternalUrl(item)) {
        links.push({ label: `Photo ${index + 1}`, url: item.trim() })
        return
      }
      const row = asRecord(item)
      if (!row) return
      const url = typeof row.url === "string" ? row.url.trim() : ""
      if (!isExternalUrl(url)) return
      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : `Photo ${index + 1}`
      links.push({ label: name, url })
    })
  }

  if (links.length === 0 && Array.isArray(obj.previews)) {
    obj.previews.forEach((item, index) => {
      if (typeof item === "string" && isExternalUrl(item)) {
        links.push({ label: `Photo ${index + 1}`, url: item.trim() })
      }
    })
  }

  return links
}

function resourceLinksFromMeet(meet: Record<string, unknown>): ResourceLink[] {
  const links: ResourceLink[] = []
  const singles: Array<[string, string]> = [
    ["Meet packet", "packetUrl"],
    ["Psych sheet", "psychSheetUrl"],
    ["Entries sheet", "entriesSheetUrl"],
    ["Results", "resultsUrl"],
    ["Live stream", "liveStreamUrl"],
  ]
  for (const [label, key] of singles) {
    const url = meet[key]
    if (typeof url === "string" && isExternalUrl(url)) {
      links.push({ label, url: url.trim() })
    }
  }

  const heatSheets = meet.heatSheetUrls
  if (Array.isArray(heatSheets)) {
    heatSheets.forEach((item, index) => {
      if (typeof item === "string" && isExternalUrl(item)) {
        links.push({ label: `Heat sheet ${index + 1}`, url: item.trim() })
        return
      }
      const row = asRecord(item)
      if (!row) return
      const url = typeof row.url === "string" ? row.url.trim() : ""
      if (!isExternalUrl(url)) return
      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : `Heat sheet ${index + 1}`
      links.push({ label: name, url })
    })
  } else {
    const url = meet.heatSheetUrl
    if (typeof url === "string" && isExternalUrl(url)) {
      links.push({ label: "Heat sheet", url: url.trim() })
    }
  }

  const finals = meet.finalsHeatSheetUrls
  if (Array.isArray(finals)) {
    finals.forEach((item, index) => {
      if (typeof item === "string" && isExternalUrl(item)) {
        links.push({ label: `Finals heat sheet ${index + 1}`, url: item.trim() })
        return
      }
      const row = asRecord(item)
      if (!row) return
      const url = typeof row.url === "string" ? row.url.trim() : ""
      if (!isExternalUrl(url)) return
      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : `Finals heat sheet ${index + 1}`
      links.push({ label: name, url })
    })
  }

  return links
}

function resourceIconName(label: string): IconName {
  const value = label.toLowerCase()
  if (value.includes("packet")) return "packet"
  if (value.includes("psych")) return "psych"
  if (value.includes("entries")) return "entries"
  if (value.includes("result")) return "trophy"
  if (value.includes("live")) return "liveStream"
  if (value.includes("heat")) return "heat"
  if (value.includes("photo")) return "photos"
  return "fileText"
}

function travelIconName(label: string): IconName {
  const value = label.toLowerCase()
  if (value.includes("hotel")) return "hotel"
  if (value.includes("packing")) return "packingList"
  if (value.includes("itinerary")) return "itinerary"
  if (value.includes("room")) return "rooms"
  if (value.includes("ride")) return "rideSignUps"
  return "fileText"
}

export default function MeetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const [hotel, setHotel] = useState("")
  const [packingList, setPackingList] = useState("")
  const [itinerary, setItinerary] = useState("")
  const [savingTravel, setSavingTravel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [relayEvent, setRelayEvent] = useState("200 Free Relay")
  const [relayGender, setRelayGender] = useState<"M" | "F" | "X">("M")
  const [relayTeams, setRelayTeams] = useState<Array<Record<string, unknown>>>(
    []
  )
  const [relayLoading, setRelayLoading] = useState(false)
  const [savingRelayKey, setSavingRelayKey] = useState<string | null>(null)
  const [previewLink, setPreviewLink] = useState<ResourceLink | null>(null)

  const queryClient = useQueryClient()
  const meetQueryKey = ["meet", id] as const

  const {
    data: meet,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: meetQueryKey,
    queryFn: () => api.getMeet(id as string),
    enabled: Boolean(id),
  })
  const load = refetch

  const viewer = asRecord(meet?.viewer)
  const isStaff = Boolean(viewer?.isStaff)

  useEffect(() => {
    if (!meet) return
    setHotel(typeof meet.hotel === "string" ? meet.hotel : "")
    setPackingList(typeof meet.packingList === "string" ? meet.packingList : "")
    setItinerary(typeof meet.itinerary === "string" ? meet.itinerary : "")
  }, [meet])

  if (!id) {
    return (
      <Screen>
        <ErrorBlock message="Not found" />
      </Screen>
    )
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    )
  }

  if (!meet) {
    return (
      <Screen>
        <ErrorBlock
          message={error instanceof Error ? error.message : "Failed to load meet"}
        />
      </Screen>
    )
  }

  const name = String(meet.name ?? "Meet")
  const startsAt = String(meet.startsAt ?? "")
  const endsAt = meet.endsAt ? String(meet.endsAt) : null
  const timeZone = typeof meet.timeZone === "string" && meet.timeZone ? meet.timeZone : DEFAULT_TIME_ZONE
  const hasStartTime = Boolean(meet.hasStartTime)
  const location = meet.location ? String(meet.location) : null
  const course = meet.course ? String(meet.course) : null
  const school = meet.school ? String(meet.school) : null
  const dateRangeAbsolute = formatMeetDateRange(startsAt, endsAt, timeZone)
  // Only a single-day meet collapses to "Today" — a multi-day range always stays
  // absolute, since a relative label would silently drop the end date.
  const dateRangeSingleDay = !endsAt || zonedDayKey(startsAt, timeZone) === zonedDayKey(endsAt, timeZone)
  const dateRangeSegment = (style: { fontSize: number; color: string }) =>
    dateRangeSingleDay ? (
      <RelativeDateText
        value={startsAt}
        kind="event"
        timeZone={timeZone}
        absolute={formatFullDate(startsAt, timeZone)}
        style={style}
      />
    ) : (
      dateRangeAbsolute
    )
  const startTimeSegment = (style: { fontSize: number; color: string }) =>
    hasStartTime ? <ZonedTimeText startsAt={startsAt} timeZone={timeZone} style={style} /> : null
  const iconUrl =
    typeof meet.iconUrl === "string" && isExternalUrl(meet.iconUrl)
      ? meet.iconUrl.trim()
      : null
  const resources = resourceLinksFromMeet(meet)
  const photoLinks = photoLinksFromMeet(meet)
  const rosterSummary = asRecord(meet.rosterSummary)
  const rosterEntries = Array.isArray(rosterSummary?.entries)
    ? rosterSummary.entries
    : []
  const rideSignUpsUrl =
    typeof meet.rideSignUpsUrl === "string" ? meet.rideSignUpsUrl.trim() : ""
  const roomsUrl = typeof meet.roomsUrl === "string" ? meet.roomsUrl.trim() : ""

  const travelFields: Array<[string, unknown]> = [
    ["Hotel", meet.hotel],
    ["Packing list", meet.packingList],
    ["Travel notes", meet.travelNotes],
    ["Itinerary", meet.itinerary],
  ]
  const travelPresent = travelFields.filter(
    ([, value]) => typeof value === "string" && !isHtmlEmpty(value)
  )
  const travelLinks: ResourceLink[] = []
  if (isExternalUrl(rideSignUpsUrl)) {
    travelLinks.push({ label: "Ride sign-ups", url: rideSignUpsUrl })
  }
  if (isExternalUrl(roomsUrl)) {
    travelLinks.push({ label: "Rooms", url: roomsUrl })
  }

  async function saveTravel() {
    if (!id) return
    setSavingTravel(true)
    try {
      await api.updateMeet(id, {
        hotel: hotel.trim() || null,
        packingList: packingList.trim() || null,
        itinerary: itinerary.trim() || null,
      })
      await load()
      Alert.alert("Saved", "Travel info updated.")
    } catch (err) {
      Alert.alert(
        "Could not save travel",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingTravel(false)
    }
  }

  async function suggestRelays() {
    if (!meet) return
    setRelayLoading(true)
    try {
      const data = await api.optimalRelays({
        meetId: id,
        relayEvent,
        course: String(meet.course ?? "SCY"),
        gender: relayGender === "X" ? "M" : relayGender,
        relayCount: 3,
      })
      const teams = Array.isArray(data.teams)
        ? (data.teams as Array<Record<string, unknown>>)
        : Array.isArray(data)
          ? (data as Array<Record<string, unknown>>)
          : []
      setRelayTeams(teams)
      if (teams.length === 0) {
        Alert.alert("No relays", "Not enough athletes with times for this event.")
      }
    } catch (err) {
      Alert.alert(
        "Could not build relays",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setRelayLoading(false)
    }
  }

  async function saveSuggestedRelay(team: Record<string, unknown>, index: number) {
    if (!id) return
    const relayKey = String(team.letter ?? String.fromCharCode(65 + index))
    const legs = Array.isArray(team.legs)
      ? (team.legs as Array<Record<string, unknown>>)
      : []
    const relayLegs = legs
      .map((leg, legIndex) => ({
        leg: legIndex + 1,
        athleteId: String(leg.athleteId ?? "").trim(),
      }))
      .filter((leg) => leg.athleteId)
    if (relayLegs.length !== 4) {
      Alert.alert("Cannot save relay", "A relay must contain four athletes.")
      return
    }
    setSavingRelayKey(relayKey)
    try {
      const totalMs = typeof team.totalMs === "number" ? team.totalMs : null
      await api.saveRelayTeam(id, {
        event: relayEvent.trim(),
        gender: relayGender,
        relayLetter: relayKey,
        relayRound: "",
        ...(totalMs != null ? { seedTime: formatTime(totalMs) } : {}),
        legs: relayLegs,
      })
      await load()
      Alert.alert("Relay published", `${relayKey} relay was published to the meet roster.`)
    } catch (err) {
      Alert.alert(
        "Could not save relay",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingRelayKey(null)
    }
  }

  function confirmDeleteMeet() {
    if (!id) return
    Alert.alert(
      "Move meet to Trash?",
      "You can restore it from Trash later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Meet only (keep swims)",
          style: "destructive",
          onPress: () => void deleteMeet(false),
        },
        {
          text: "Meet and swims",
          style: "destructive",
          onPress: () => void deleteMeet(true),
        },
      ]
    )
  }

  async function deleteMeet(deleteSwims: boolean) {
    if (!id) return
    setDeleting(true)
    try {
      await api.deleteMeet(id, deleteSwims)
      await queryClient.invalidateQueries()
      router.replace("/meets")
    } catch (err) {
      Alert.alert(
        "Could not delete meet",
        err instanceof Error ? err.message : "Something went wrong"
      )
      setDeleting(false)
    }
  }

  const relayLineupCount = Array.isArray(meet?.relayLineups) ? meet.relayLineups.length : 0

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPad }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            marginBottom: spacing.sm,
          }}
        >
          {iconUrl ? (
            <Image
              source={{ uri: iconUrl }}
              style={{ width: 56, height: 56, borderRadius: 10 }}
              accessibilityLabel={`${name} icon`}
            />
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Title>{name}</Title>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
              <SubtitleSegments
                textStyle={{ fontSize: 14, color: c.textSecondary }}
                segments={[
                  dateRangeSegment({ fontSize: 14, color: c.textSecondary }),
                  startTimeSegment({ fontSize: 14, color: c.textSecondary }),
                  location,
                  course,
                  school,
                ]}
              />
            </View>
          </View>
        </View>

        {error ? (
          <ErrorBlock message={error instanceof Error ? error.message : "Failed to load meet"} />
        ) : null}

        <Section title="Details">
          <MetaRow label="Dates" value={dateRangeSegment({ fontSize: 14, color: c.text })} />
          {hasStartTime ? (
            <MetaRow
              label="Start time"
              value={startTimeSegment({ fontSize: 14, color: c.text })}
            />
          ) : null}
          {location ? <MetaRow label="Location" value={location} /> : null}
          {course ? <MetaRow label="Course" value={course} /> : null}
          {school ? <MetaRow label="School" value={school} /> : null}
        </Section>

        {resources.length > 0 ? (
          <Section title="Resources">
            <View style={{ gap: spacing.sm }}>
              {resources.map((link) => (
                <Button
                  key={`${link.label}-${link.url}`}
                  icon={<Icon color={c.text} name={resourceIconName(link.label)} size={16} />}
                  label={link.label}
                  variant="secondary"
                  onPress={() => setPreviewLink(link)}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {isEventOrder(meet.eventOrder) ? (
          <EventOrderSection order={meet.eventOrder} />
        ) : null}

        {photoLinks.length > 0 ? (
          <Section title="Photos">
            {photoLinks.map((link) => (
              <ListRow
                key={`${link.label}-${link.url}`}
                left={<Icon color={c.textTertiary} name="photos" size={16} />}
                title={link.label}
                subtitle="Open album"
                onPress={() => setPreviewLink(link)}
              />
            ))}
          </Section>
        ) : null}

        {isStaff ? (
          <Section title="Travel (staff)">
            <TextField
              label="Hotel"
              value={hotel}
              onChangeText={setHotel}
              multiline
              style={{ minHeight: 64, textAlignVertical: "top" }}
            />
            <TextField
              label="Packing list"
              value={packingList}
              onChangeText={setPackingList}
              multiline
              style={{ minHeight: 64, textAlignVertical: "top" }}
            />
            <TextField
              label="Itinerary"
              value={itinerary}
              onChangeText={setItinerary}
              multiline
              style={{ minHeight: 64, textAlignVertical: "top" }}
            />
            {travelLinks.length > 0 ? (
              <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                {travelLinks.map((link) => (
                  <Button
                    key={`${link.label}-${link.url}`}
                    label={link.label}
                    variant="secondary"
                    onPress={() => setPreviewLink(link)}
                  />
                ))}
              </View>
            ) : null}
            <Button
              label="Save travel"
              loading={savingTravel}
              onPress={() => void saveTravel()}
            />
          </Section>
        ) : travelPresent.length > 0 || travelLinks.length > 0 ? (
          <Section title="Travel">
            {travelPresent.map(([label, value]) => (
              <View key={label} style={{ marginBottom: spacing.sm }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
                  <Icon color={c.textTertiary} name={travelIconName(label)} size={16} />
                  <Body style={{ fontWeight: "700" }}>{label}</Body>
                </View>
                <FormattedText html={String(value)} />
              </View>
            ))}
            {travelLinks.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                {travelLinks.map((link) => (
                  <Button
                    key={`${link.label}-${link.url}`}
                    label={link.label}
                    variant="secondary"
                    onPress={() => setPreviewLink(link)}
                  />
                ))}
              </View>
            ) : null}
          </Section>
        ) : null}

        {rosterEntries.length > 0 ? (
          <RosterSummarySection
            entries={rosterEntries as RosterSummaryEntry[]}
            viewerAthleteId={
              viewer?.athleteId ? String(viewer.athleteId) : null
            }
          />
        ) : null}

        {relayLineupCount > 0 ? (
          <Section title="Relays">
            <ListRow
              title={`${relayLineupCount} relay${relayLineupCount === 1 ? "" : "s"}`}
              subtitle="See every relay lineup for this meet"
              onPress={() => router.push(`/meets/relays/${id}`)}
            />
          </Section>
        ) : null}

        {isStaff ? (
          <Section title="Relay builder">
            <Muted style={{ marginBottom: spacing.sm }}>
              Build optimal lineups from SwimCloud times.
            </Muted>
            <TextField
              label="Relay event"
              value={relayEvent}
              onChangeText={setRelayEvent}
              placeholder="200 Free Relay"
            />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginBottom: spacing.sm,
              }}
            >
              {(["M", "F", "X"] as const).map((g) => (
                <Chip
                  key={g}
                  label={g === "X" ? "Mixed" : g}
                  selected={relayGender === g}
                  onPress={() => setRelayGender(g)}
                />
              ))}
            </View>
            <Button
              label="Suggest optimal relays"
              loading={relayLoading}
              variant="secondary"
              onPress={() => void suggestRelays()}
            />
            {relayTeams.map((team, index) => {
              const legs = Array.isArray(team.legs)
                ? (team.legs as Array<Record<string, unknown>>)
                : []
              const totalMs =
                typeof team.totalMs === "number" ? team.totalMs : null
              const relayKey = String(
                team.letter ?? String.fromCharCode(65 + index)
              )
              return (
                <View key={relayKey} style={{ marginBottom: spacing.sm }}>
                  <ListRow
                    title={`${relayKey} relay`}
                    subtitle={[
                      totalMs != null ? formatTime(totalMs) : null,
                      legs
                        .map((leg) => String(leg.name ?? leg.athleteId ?? ""))
                        .filter(Boolean)
                        .join(" · "),
                    ]
                      .filter(Boolean)
                      .join(" — ")}
                  />
                  <Button
                    disabled={
                      savingRelayKey !== null && savingRelayKey !== relayKey
                    }
                    label={`Publish ${relayKey} relay`}
                    loading={savingRelayKey === relayKey}
                    variant="secondary"
                    onPress={() => void saveSuggestedRelay(team, index)}
                  />
                </View>
              )
            })}
          </Section>
        ) : null}

        {isStaff ? (
          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="Move to Trash"
              variant="danger"
              loading={deleting}
              onPress={confirmDeleteMeet}
            />
          </View>
        ) : null}
      </ScrollView>
      <FilePreviewModal
        open={previewLink !== null}
        title={previewLink?.label ?? "File preview"}
        url={previewLink?.url ?? ""}
        onClose={() => setPreviewLink(null)}
      />
    </Screen>
  )
}

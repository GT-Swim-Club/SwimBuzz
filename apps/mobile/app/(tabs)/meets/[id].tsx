import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Image, View } from "react-native"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { DEFAULT_TIME_ZONE, formatClockTimeInViewerZone, formatMeetDateRange, formatTime, isHtmlEmpty, type IconName } from "@swimbuzz/shared"
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
import { isExternalUrl } from "../../../src/lib/href"

type ResourceLink = { label: string; url: string }

type DraftRoom = {
  id?: string
  label: string
  athleteIds: string[]
}

type SignupQuestion = {
  id: string
  label: string
  required: boolean
  type: "text" | "choice"
  options: string[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function asStringRecord(value: unknown): Record<string, string> {
  const row = asRecord(value)
  if (!row) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(row)) {
    if (typeof item === "string") out[key] = item
  }
  return out
}

function normalizeSignupQuestions(value: unknown): SignupQuestion[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const row = asRecord(item)
      if (!row) return null
      const id = typeof row.id === "string" ? row.id.trim() : ""
      const label = typeof row.label === "string" ? row.label.trim() : ""
      if (!id || !label) return null
      const type: "text" | "choice" = row.type === "choice" ? "choice" : "text"
      const options =
        type === "choice" && Array.isArray(row.options)
          ? [
              ...new Set(
                row.options
                  .map((o) => (typeof o === "string" ? o.trim() : ""))
                  .filter(Boolean)
              ),
            ]
          : []
      if (type === "choice" && options.length < 2) return null
      return {
        id,
        label,
        required: Boolean(row.required),
        type,
        options,
      }
    })
    .filter((q): q is SignupQuestion => q != null)
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

function roomsFromMeet(rooms: Record<string, unknown> | null): DraftRoom[] {
  const roomList = Array.isArray(rooms?.rooms)
    ? (rooms.rooms as Array<Record<string, unknown>>)
    : []
  return roomList.map((room, index) => ({
    id: typeof room.id === "string" ? room.id : undefined,
    label: String(room.label ?? `Room ${index + 1}`),
    athleteIds: asStringArray(room.athleteIds).length
      ? asStringArray(room.athleteIds)
      : Array.isArray(room.athletes)
        ? (room.athletes as Array<Record<string, unknown>>)
            .map((a) => String(a.id ?? ""))
            .filter(Boolean)
        : Array.isArray(room.assignments)
          ? (room.assignments as Array<Record<string, unknown>>)
              .map((a) => String(a.athleteId ?? asRecord(a.athlete)?.id ?? ""))
              .filter(Boolean)
          : [],
  }))
}

export default function MeetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const [meet, setMeet] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [signupNotes, setSignupNotes] = useState("")
  const [entryTimes, setEntryTimes] = useState<Record<string, string>>({})
  const [signupAnswers, setSignupAnswers] = useState<Record<string, string>>(
    {}
  )
  const [preferredIds, setPreferredIds] = useState<string[]>([])
  const [savingSignup, setSavingSignup] = useState(false)
  const [savingRooms, setSavingRooms] = useState(false)
  const [hotel, setHotel] = useState("")
  const [packingList, setPackingList] = useState("")
  const [itinerary, setItinerary] = useState("")
  const [savingTravel, setSavingTravel] = useState(false)
  const [draftRooms, setDraftRooms] = useState<DraftRoom[]>([])
  const [newRoomLabel, setNewRoomLabel] = useState("")
  const [savingAssignments, setSavingAssignments] = useState(false)
  const [publishingRooms, setPublishingRooms] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [relayEvent, setRelayEvent] = useState("200 Free Relay")
  const [relayGender, setRelayGender] = useState<"M" | "F" | "X">("M")
  const [relayTeams, setRelayTeams] = useState<Array<Record<string, unknown>>>(
    []
  )
  const [relayLoading, setRelayLoading] = useState(false)
  const [savingRelayKey, setSavingRelayKey] = useState<string | null>(null)
  const [previewLink, setPreviewLink] = useState<ResourceLink | null>(null)

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }
    setError(null)
    try {
      const data = await api.getMeet(id)
      setMeet(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meet")
      setMeet(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const signup = asRecord(meet?.signup)
  const signupForm = asRecord(signup?.form)
  const myEntry = asRecord(signup?.myEntry)
  const rooms = asRecord(meet?.rooms)
  const roomsForm = asRecord(rooms?.form)
  const myPreference = asRecord(rooms?.myPreference)
  const myRoom = asRecord(rooms?.myRoom)
  const viewer = asRecord(meet?.viewer)
  const isStaff = Boolean(viewer?.isStaff)

  useEffect(() => {
    if (!meet) return
    setHotel(typeof meet.hotel === "string" ? meet.hotel : "")
    setPackingList(typeof meet.packingList === "string" ? meet.packingList : "")
    setItinerary(typeof meet.itinerary === "string" ? meet.itinerary : "")
    setDraftRooms(roomsFromMeet(asRecord(meet.rooms)))
  }, [meet])

  const eventOptions = useMemo(() => {
    const fromSignup = asStringArray(signup?.eventOptions)
    if (fromSignup.length > 0) return fromSignup
    return asStringArray(signupForm?.eventOptions)
  }, [signup, signupForm])

  useEffect(() => {
    setSelectedEvents(asStringArray(myEntry?.events))
    setSignupNotes(typeof myEntry?.notes === "string" ? myEntry.notes : "")
    setEntryTimes(asStringRecord(myEntry?.entryTimes))
    setSignupAnswers(asStringRecord(myEntry?.answers))
  }, [
    myEntry?.id,
    myEntry?.events,
    myEntry?.notes,
    myEntry?.entryTimes,
    myEntry?.answers,
  ])

  useEffect(() => {
    setPreferredIds(asStringArray(myPreference?.preferredAthleteIds))
  }, [myPreference?.id, myPreference?.preferredAthleteIds])

  if (loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    )
  }

  if (!meet) {
    return (
      <Screen>
        <ErrorBlock message={error ?? "Not found"} />
      </Screen>
    )
  }

  const name = String(meet.name ?? "Meet")
  const startDate = String(meet.startDate ?? "")
  const endDate = meet.endDate ? String(meet.endDate) : null
  const location = meet.location ? String(meet.location) : null
  const course = meet.course ? String(meet.course) : null
  const school = meet.school ? String(meet.school) : null
  const startTime =
    typeof meet.startTime === "string" && meet.startTime.trim()
      ? (() => {
          const zoned = formatClockTimeInViewerZone(
            startDate ? startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
            meet.startTime.trim(),
            typeof meet.timeZone === "string" && meet.timeZone ? meet.timeZone : DEFAULT_TIME_ZONE
          )
          return `${zoned.text} ${zoned.abbrev}`
        })()
      : null
  const iconUrl =
    typeof meet.iconUrl === "string" && isExternalUrl(meet.iconUrl)
      ? meet.iconUrl.trim()
      : null
  const resources = resourceLinksFromMeet(meet)
  const photoLinks = photoLinksFromMeet(meet)
  const askNotes = Boolean(signupForm?.askNotes)
  const customQuestions = normalizeSignupQuestions(signupForm?.customQuestions)
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

  const window = asRecord(signupForm?.window)
  const windowOpen = Boolean(window?.open)
  const windowReason =
    typeof window?.reason === "string" && window.reason ? window.reason : null
  const canEditSignup =
    Boolean(signup?.show) && Boolean(viewer?.athleteId) && windowOpen
  const showSignup = Boolean(signup?.show)

  const maxPreferences =
    typeof roomsForm?.maxPreferences === "number"
      ? roomsForm.maxPreferences
      : 3
  const roomAthletes = Array.isArray(rooms?.athletes)
    ? (rooms.athletes as Array<Record<string, unknown>>)
    : []
  const viewerAthleteId =
    typeof viewer?.athleteId === "string" ? viewer.athleteId : null
  const viewerGender = roomAthletes.find((a) => a.id === viewerAthleteId)?.gender
  const preferenceCandidates = roomAthletes.filter(
    (a) =>
      a.id !== viewerAthleteId &&
      (viewerGender == null || a.gender === viewerGender)
  )
  const roomsWindow = asRecord(roomsForm?.window)
  const roomsOpen = roomsWindow ? Boolean(roomsWindow.open) : true
  const canEditRooms =
    Boolean(rooms?.show) &&
    Boolean(viewerAthleteId) &&
    roomsOpen &&
    preferenceCandidates.length > 0
  const roomsPublished = Boolean(roomsForm?.assignmentsPublishedAt)

  function toggleEvent(event: string) {
    setSelectedEvents((prev) => {
      if (prev.includes(event)) {
        setEntryTimes((times) => {
          const next = { ...times }
          delete next[event]
          return next
        })
        return prev.filter((e) => e !== event)
      }
      return [...prev, event]
    })
  }

  function togglePreferred(athleteId: string) {
    setPreferredIds((prev) => {
      if (prev.includes(athleteId)) {
        return prev.filter((id) => id !== athleteId)
      }
      if (prev.length >= maxPreferences) {
        Alert.alert(
          "Preference limit",
          `You can select up to ${maxPreferences} preferred roommate${maxPreferences === 1 ? "" : "s"}.`
        )
        return prev
      }
      return [...prev, athleteId]
    })
  }

  async function saveSignup() {
    if (!id) return
    setSavingSignup(true)
    try {
      const times: Record<string, string> = {}
      for (const event of selectedEvents) {
        const time = entryTimes[event]?.trim()
        if (time) times[event] = time
      }
      await api.putSignupEntry(id, {
        events: selectedEvents,
        entryTimes: times,
        notes: signupNotes,
        answers: signupAnswers,
      })
      await load()
      Alert.alert("Saved", "Your signup was updated.")
    } catch (err) {
      Alert.alert(
        "Could not save signup",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingSignup(false)
    }
  }

  async function withdrawSignup() {
    if (!id) return
    setSavingSignup(true)
    try {
      await api.deleteSignupEntry(id)
      setSelectedEvents([])
      setSignupNotes("")
      setEntryTimes({})
      setSignupAnswers({})
      await load()
      Alert.alert("Withdrawn", "Your signup entry was removed.")
    } catch (err) {
      Alert.alert(
        "Could not withdraw",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingSignup(false)
    }
  }

  async function saveRoomPreference() {
    if (!id) return
    setSavingRooms(true)
    try {
      await api.putRoomPreference(id, {
        preferredAthleteIds: preferredIds,
        excludedAthleteIds: asStringArray(myPreference?.excludedAthleteIds),
        notes:
          typeof myPreference?.notes === "string" ? myPreference.notes : undefined,
      })
      await load()
      Alert.alert("Saved", "Your roommate preferences were updated.")
    } catch (err) {
      Alert.alert(
        "Could not save preferences",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingRooms(false)
    }
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

  function toggleRoomAthlete(roomIndex: number, athleteId: string) {
    setDraftRooms((prev) =>
      prev.map((room, i) => {
        if (i === roomIndex) {
          const has = room.athleteIds.includes(athleteId)
          return {
            ...room,
            athleteIds: has
              ? room.athleteIds.filter((id) => id !== athleteId)
              : [...room.athleteIds, athleteId],
          }
        }
        return {
          ...room,
          athleteIds: room.athleteIds.filter((id) => id !== athleteId),
        }
      })
    )
  }

  function addRoom() {
    const label = newRoomLabel.trim() || `Room ${draftRooms.length + 1}`
    setDraftRooms((prev) => [...prev, { label, athleteIds: [] }])
    setNewRoomLabel("")
  }

  async function saveAssignments() {
    if (!id) return
    setSavingAssignments(true)
    try {
      await api.putRoomAssignments(
        id,
        draftRooms.map((room) => ({
          ...(room.id ? { id: room.id } : {}),
          label: room.label,
          athleteIds: room.athleteIds,
        }))
      )
      await load()
      Alert.alert("Saved", "Room assignments updated.")
    } catch (err) {
      Alert.alert(
        "Could not save rooms",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingAssignments(false)
    }
  }

  async function togglePublishRooms() {
    if (!id) return
    setPublishingRooms(true)
    try {
      await api.publishRooms(id, !roomsPublished)
      await load()
      Alert.alert(
        roomsPublished ? "Unpublished" : "Published",
        roomsPublished
          ? "Room assignments are hidden from athletes."
          : "Room assignments are visible to athletes."
      )
    } catch (err) {
      Alert.alert(
        "Could not update publish state",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setPublishingRooms(false)
    }
  }

  async function suggestRelays() {
    if (!meet) return
    setRelayLoading(true)
    try {
      const signupEntries = Array.isArray(signup?.entries)
        ? (signup.entries as Array<Record<string, unknown>>)
        : []
      const athleteIds =
        signupEntries.length > 0
          ? signupEntries.map((e) => String(e.athleteId)).filter(Boolean)
          : Array.isArray(signup?.athletes)
            ? (signup.athletes as Array<Record<string, unknown>>)
                .map((a) => String(a.id))
                .filter(Boolean)
            : undefined
      const data = await api.optimalRelays({
        relayEvent,
        course: String(meet.course ?? "SCY"),
        gender: relayGender === "X" ? "M" : relayGender,
        relayCount: 3,
        athleteIds,
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
      Alert.alert("Relay saved", `${relayKey} relay was added to the meet roster.`)
    } catch (err) {
      Alert.alert(
        "Could not save relay",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingRelayKey(null)
    }
  }

  async function deleteSavedRelay(entry: Record<string, unknown>, index: number) {
    if (!id) return
    const event = String(entry.event ?? "").trim()
    const relayLetter = String(entry.relayLetter ?? "").trim()
    const relayRound = String(entry.relayRound ?? "").trim()
    const gender = String(entry.gender ?? "").trim()
    const relayKey = `${event}:${relayLetter}:${relayRound}:${gender || index}`
    if (!event) {
      Alert.alert("Cannot remove relay", "The relay event is missing.")
      return
    }
    setSavingRelayKey(relayKey)
    try {
      await api.deleteRelayTeam(id, {
        event,
        relayLetter,
        relayRound,
        gender,
      })
      await load()
      Alert.alert("Relay removed", "The relay was removed from the meet roster.")
    } catch (err) {
      Alert.alert(
        "Could not remove relay",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingRelayKey(null)
    }
  }

  function confirmDeleteMeet() {
    if (!id) return
    Alert.alert(
      "Delete meet?",
      "This permanently deletes the meet and related data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteMeet(),
        },
      ]
    )
  }

  async function deleteMeet() {
    if (!id) return
    setDeleting(true)
    try {
      await api.deleteMeet(id)
      router.replace("/meets")
    } catch (err) {
      Alert.alert(
        "Could not delete meet",
        err instanceof Error ? err.message : "Something went wrong"
      )
      setDeleting(false)
    }
  }

  const staffEntries = Array.isArray(signup?.entries)
    ? (signup.entries as Array<Record<string, unknown>>)
    : []
  const staffPreferences = Array.isArray(rooms?.preferences)
    ? (rooms.preferences as Array<Record<string, unknown>>)
    : []
  const roomList = Array.isArray(rooms?.rooms)
    ? (rooms.rooms as Array<Record<string, unknown>>)
    : []
  const relaySummary = asRecord(meet?.relayResultsSummary)
  const savedRelayEntries = Array.isArray(relaySummary?.entries)
    ? (relaySummary.entries as Array<Record<string, unknown>>)
    : []
  const showRoomsSection = Boolean(rooms?.show) || (isStaff && Boolean(roomsForm))

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
            <Muted>
              {[
                formatMeetDateRange(startDate, endDate),
                startTime,
                location,
                course,
                school,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Muted>
          </View>
        </View>

        {error ? <ErrorBlock message={error} /> : null}

        <Section title="Details">
          <MetaRow label="Dates" value={formatMeetDateRange(startDate, endDate)} />
          {startTime ? <MetaRow label="Start time" value={startTime} /> : null}
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

        {showSignup ? (
          <Section title="Signup">
            {typeof signupForm?.instructions === "string" &&
            signupForm.instructions.trim() ? (
              <Body style={{ marginBottom: spacing.sm }}>
                {signupForm.instructions.trim()}
              </Body>
            ) : null}
            <Muted style={{ marginBottom: spacing.sm }}>
              {windowOpen
                ? "Signup window is open"
                : windowReason
                  ? `Signup closed: ${windowReason}`
                  : "Signup window is closed"}
            </Muted>

            {myEntry ? (
              <View style={{ marginBottom: spacing.sm }}>
                <Muted>
                  Your events:{" "}
                  {asStringArray(myEntry.events).join(", ") || "None selected"}
                </Muted>
                {typeof myEntry.notes === "string" && myEntry.notes.trim() ? (
                  <Muted style={{ marginTop: spacing.xs }}>
                    Notes: {myEntry.notes.trim()}
                  </Muted>
                ) : null}
              </View>
            ) : (
              <Muted style={{ marginBottom: spacing.sm }}>
                You have not signed up yet.
              </Muted>
            )}

            {eventOptions.length > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginBottom: spacing.sm,
                }}
              >
                {eventOptions.map((event) => (
                  <Chip
                    key={event}
                    label={event}
                    selected={selectedEvents.includes(event)}
                    onPress={
                      canEditSignup ? () => toggleEvent(event) : undefined
                    }
                  />
                ))}
              </View>
            ) : (
              <Muted style={{ marginBottom: spacing.sm }}>
                No event options configured.
              </Muted>
            )}

            {canEditSignup && selectedEvents.length > 0 ? (
              <View style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
                <Muted>Optional entry times</Muted>
                {selectedEvents.map((event) => (
                  <TextField
                    key={`time-${event}`}
                    label={`${event} time`}
                    value={entryTimes[event] ?? ""}
                    onChangeText={(text) =>
                      setEntryTimes((prev) => ({ ...prev, [event]: text }))
                    }
                    placeholder="e.g. 1:23.45"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                ))}
              </View>
            ) : null}

            {canEditSignup && askNotes ? (
              <TextField
                label="Notes"
                value={signupNotes}
                onChangeText={setSignupNotes}
                multiline
                style={{
                  minHeight: 64,
                  textAlignVertical: "top",
                  marginBottom: spacing.sm,
                }}
              />
            ) : null}

            {canEditSignup && customQuestions.length > 0 ? (
              <View style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
                {customQuestions.map((question) =>
                  question.type === "choice" ? (
                    <View key={question.id}>
                      <Muted style={{ marginBottom: spacing.xs }}>
                        {question.label}
                        {question.required ? " *" : ""}
                      </Muted>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                        }}
                      >
                        {question.options.map((option) => (
                          <Chip
                            key={`${question.id}-${option}`}
                            label={option}
                            selected={signupAnswers[question.id] === option}
                            onPress={() =>
                              setSignupAnswers((prev) => ({
                                ...prev,
                                [question.id]: option,
                              }))
                            }
                          />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <TextField
                      key={question.id}
                      label={`${question.label}${question.required ? " *" : ""}`}
                      value={signupAnswers[question.id] ?? ""}
                      onChangeText={(text) =>
                        setSignupAnswers((prev) => ({
                          ...prev,
                          [question.id]: text,
                        }))
                      }
                    />
                  )
                )}
              </View>
            ) : null}

            {canEditSignup ? (
              <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                <Button
                  label="Save signup"
                  loading={savingSignup}
                  onPress={() => void saveSignup()}
                />
                {myEntry ? (
                  <Button
                    label="Withdraw signup"
                    variant="danger"
                    loading={savingSignup}
                    onPress={() => void withdrawSignup()}
                  />
                ) : null}
              </View>
            ) : myEntry ? (
              <Button
                label="Withdraw signup"
                variant="danger"
                loading={savingSignup}
                onPress={() => void withdrawSignup()}
                style={{ marginBottom: spacing.sm }}
              />
            ) : null}

            {isStaff && staffEntries.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
                  Entries
                </Body>
                {staffEntries.map((entry) => (
                  <ListRow
                    key={String(entry.id ?? entry.athleteId)}
                    title={`${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim()}
                    subtitle={asStringArray(entry.events).join(", ") || "No events"}
                  />
                ))}
              </View>
            ) : null}
          </Section>
        ) : null}

        {showRoomsSection ? (
          <Section title="Rooms">
            {typeof roomsForm?.instructions === "string" &&
            roomsForm.instructions.trim() ? (
              <Body style={{ marginBottom: spacing.sm }}>
                {roomsForm.instructions.trim()}
              </Body>
            ) : null}

            {myRoom ? (
              <View style={{ marginBottom: spacing.sm }}>
                <Body style={{ fontWeight: "700" }}>
                  Your room: {String(myRoom.label ?? "Assigned")}
                </Body>
                {Array.isArray(myRoom.roommates) && myRoom.roommates.length > 0 ? (
                  <Muted>
                    With{" "}
                    {(myRoom.roommates as Array<Record<string, unknown>>)
                      .map(
                        (r) =>
                          `${String(r.firstName ?? "")} ${String(r.lastName ?? "")}`.trim()
                      )
                      .filter(Boolean)
                      .join(", ")}
                  </Muted>
                ) : (
                  <Muted>No roommates listed yet.</Muted>
                )}
              </View>
            ) : null}

            {canEditRooms ? (
              <>
                <Muted style={{ marginBottom: spacing.sm }}>
                  Prefer up to {maxPreferences} roommate
                  {maxPreferences === 1 ? "" : "s"} (same gender).
                </Muted>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    marginBottom: spacing.sm,
                  }}
                >
                  {preferenceCandidates.map((athlete) => {
                    const athleteId = String(athlete.id)
                    const label = String(athlete.name ?? athleteId)
                    return (
                      <Chip
                        key={athleteId}
                        label={label}
                        selected={preferredIds.includes(athleteId)}
                        onPress={() => togglePreferred(athleteId)}
                      />
                    )
                  })}
                </View>
                <Button
                  label="Save room preferences"
                  loading={savingRooms}
                  onPress={() => void saveRoomPreference()}
                  style={{ marginBottom: spacing.sm }}
                />
              </>
            ) : myPreference ? (
              <Muted style={{ marginBottom: spacing.sm }}>
                Preferred:{" "}
                {asStringArray(myPreference.preferredAthleteIds)
                  .map((athleteId) => {
                    const match = roomAthletes.find((a) => a.id === athleteId)
                    return match ? String(match.name ?? athleteId) : athleteId
                  })
                  .join(", ") || "None"}
              </Muted>
            ) : null}

            {isStaff && staffPreferences.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
                  Preferences
                </Body>
                {staffPreferences.map((pref) => {
                  const athlete = asRecord(pref.athlete)
                  const title = athlete
                    ? `${athlete.firstName ?? ""} ${athlete.lastName ?? ""}`.trim()
                    : `${pref.firstName ?? ""} ${pref.lastName ?? ""}`.trim() ||
                      String(pref.athleteId ?? "Athlete")
                  const preferred = asStringArray(pref.preferredAthleteIds)
                    .map((athleteId) => {
                      const match = roomAthletes.find((a) => a.id === athleteId)
                      return match ? String(match.name ?? athleteId) : athleteId
                    })
                    .join(", ")
                  return (
                    <ListRow
                      key={String(pref.id ?? pref.athleteId)}
                      title={title || "Athlete"}
                      subtitle={preferred || "No preferences"}
                    />
                  )
                })}
              </View>
            ) : null}

            {isStaff && roomsForm ? (
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                <Body style={{ fontWeight: "700" }}>Room assignments</Body>
                <Muted>
                  {roomsPublished
                    ? "Assignments are published to athletes."
                    : "Assignments are not published yet."}
                </Muted>
                <Button
                  label={roomsPublished ? "Unpublish rooms" : "Publish rooms"}
                  variant="secondary"
                  loading={publishingRooms}
                  onPress={() => void togglePublishRooms()}
                />

                {draftRooms.map((room, roomIndex) => (
                  <View
                    key={room.id ?? `draft-${roomIndex}`}
                    style={{ marginTop: spacing.sm }}
                  >
                    <TextField
                      label={`Room ${roomIndex + 1} label`}
                      value={room.label}
                      onChangeText={(text) =>
                        setDraftRooms((prev) =>
                          prev.map((r, i) =>
                            i === roomIndex ? { ...r, label: text } : r
                          )
                        )
                      }
                    />
                    <Muted style={{ marginBottom: spacing.xs }}>
                      Athletes ({room.athleteIds.length})
                    </Muted>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        marginBottom: spacing.sm,
                      }}
                    >
                      {roomAthletes.map((athlete) => {
                        const athleteId = String(athlete.id)
                        const label =
                          String(
                            athlete.name ??
                              `${athlete.firstName ?? ""} ${athlete.lastName ?? ""}`.trim()
                          ) || athleteId
                        return (
                          <Chip
                            key={`${roomIndex}-${athleteId}`}
                            label={label}
                            selected={room.athleteIds.includes(athleteId)}
                            onPress={() =>
                              toggleRoomAthlete(roomIndex, athleteId)
                            }
                          />
                        )
                      })}
                    </View>
                    <Button
                      label="Remove room"
                      variant="danger"
                      onPress={() =>
                        setDraftRooms((prev) =>
                          prev.filter((_, i) => i !== roomIndex)
                        )
                      }
                    />
                  </View>
                ))}

                <TextField
                  label="New room label"
                  value={newRoomLabel}
                  onChangeText={setNewRoomLabel}
                  placeholder={`Room ${draftRooms.length + 1}`}
                />
                <Button
                  label="Add room"
                  variant="secondary"
                  onPress={addRoom}
                />
                <Button
                  label="Save assignments"
                  loading={savingAssignments}
                  onPress={() => void saveAssignments()}
                />
              </View>
            ) : isStaff && roomList.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <Body style={{ fontWeight: "700", marginBottom: spacing.xs }}>
                  Room assignments
                </Body>
                {roomList.map((room, index) => {
                  const assignments = Array.isArray(room.assignments)
                    ? (room.assignments as Array<Record<string, unknown>>)
                    : Array.isArray(room.athletes)
                      ? (room.athletes as Array<Record<string, unknown>>)
                      : asStringArray(room.athleteIds).map((athleteId) => {
                          const match = roomAthletes.find((a) => a.id === athleteId)
                          return match ?? { id: athleteId, name: athleteId }
                        })
                  const names = assignments
                    .map((a) => {
                      const nested = asRecord(a.athlete)
                      if (nested) {
                        return `${nested.firstName ?? ""} ${nested.lastName ?? ""}`.trim()
                      }
                      if (a.name) return String(a.name)
                      return `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim()
                    })
                    .filter(Boolean)
                    .join(", ")
                  return (
                    <ListRow
                      key={String(room.id ?? room.label ?? index)}
                      title={String(room.label ?? `Room ${index + 1}`)}
                      subtitle={names || "Empty"}
                    />
                  )
                })}
              </View>
            ) : null}
          </Section>
        ) : null}

        {isStaff ? (
          <Section title="Relays">
            <Muted style={{ marginBottom: spacing.sm }}>
              Build optimal lineups from SwimCloud times for athletes signed up
              or on the season roster.
            </Muted>
            {savedRelayEntries.length > 0 ? (
              <View style={{ marginBottom: spacing.md }}>
                <Muted style={{ marginBottom: spacing.xs }}>
                  Saved on the meet roster
                </Muted>
                {savedRelayEntries.map((entry, index) => {
                  const event = String(entry.event ?? "Relay")
                  const relayLetter = String(
                    entry.relayLetter ?? String.fromCharCode(65 + index)
                  )
                  const relayRound = String(entry.relayRound ?? "")
                  const gender = String(entry.gender ?? "")
                  const relayKey = `${event}:${relayLetter}:${relayRound}:${gender || index}`
                  const swimmers = Array.isArray(entry.relaySwimmers)
                    ? (entry.relaySwimmers as Array<Record<string, unknown>>)
                    : []
                  const swimmerNames = swimmers
                    .map((swimmer) => {
                      return String(
                        swimmer.name ?? swimmer.athleteName ?? swimmer.athleteId ?? ""
                      )
                    })
                    .filter(Boolean)
                    .join(" · ")
                  const seed = String(entry.seedTime ?? entry.resultTime ?? "")
                  return (
                    <ListRow
                      key={relayKey}
                      right={
                        entry.manual ? (
                          <Button
                            disabled={
                              savingRelayKey !== null && savingRelayKey !== relayKey
                            }
                            label="Remove"
                            loading={savingRelayKey === relayKey}
                            variant="danger"
                            onPress={() => void deleteSavedRelay(entry, index)}
                          />
                        ) : undefined
                      }
                      subtitle={[seed, swimmerNames].filter(Boolean).join(" — ")}
                      title={`${relayLetter} · ${event}`}
                    />
                  )
                })}
              </View>
            ) : null}
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
                    label={`Add ${relayKey} relay to roster`}
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
              label="Delete meet"
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

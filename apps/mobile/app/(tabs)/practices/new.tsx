import { useState } from "react"
import { Alert, Switch, View } from "react-native"
import { useRouter } from "expo-router"
import {
  Body,
  Button,
  Muted,
  Screen,
  ScrollView,
  TextField,
  usePalette,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { getViewerTimeZone, zoneAbbreviation, zoneDisplayName } from "@swimbuzz/shared"
import { DateSelector, TimeSelector } from "../../../src/components/DateTimeSelector"
import { api } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"

function clockToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function endAfterStart(start: string, preferredEnd?: string): string {
  const startMinutes = clockToMinutes(start)
  if (startMinutes == null) return preferredEnd || "21:00"
  const preferredMinutes = preferredEnd ? clockToMinutes(preferredEnd) : null
  if (preferredMinutes != null && preferredMinutes > startMinutes) return preferredEnd!
  // Snap to the 15-minute grid used by TimeSelector.
  const next = Math.min(Math.ceil((startMinutes + 30) / 15) * 15, 23 * 60 + 45)
  if (next <= startMinutes) {
    const bump = Math.min(startMinutes + 15, 23 * 60 + 45)
    return `${String(Math.floor(bump / 60)).padStart(2, "0")}:${String(bump % 60).padStart(2, "0")}`
  }
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`
}

export default function NewPracticeScreen() {
  const router = useRouter()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const [title, setTitle] = useState("")
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("19:30")
  const [endTime, setEndTime] = useState("21:00")
  const [location, setLocation] = useState("CRC Comp Pool")
  const [focus, setFocus] = useState("")
  const [setContent, setSetContent] = useState("")
  const [published, setPublished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [timeZone] = useState(() => getViewerTimeZone())
  const timeZoneLabel = `${zoneDisplayName(timeZone)} (${zoneAbbreviation(timeZone)})`

  async function onCreate() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      Alert.alert("Title required", "Enter a practice title.")
      return
    }
    if (date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert("Invalid date", "Select a date or leave it blank.")
      return
    }
    const start = startTime.trim() || "19:30"
    const end = endTime.trim() || "21:00"
    if ((clockToMinutes(end) ?? 0) <= (clockToMinutes(start) ?? 0)) {
      Alert.alert("Invalid end time", "End time must be after start time.")
      return
    }
    const content = setContent.trim()
    if (!content) {
      Alert.alert("Set required", "Add at least one set’s workout content.")
      return
    }
    setSaving(true)
    try {
      const practice = (await api.createPractice({
        title: trimmedTitle,
        date: date.trim() || null,
        startTime: start,
        endTime: end,
        timeZone,
        location: location.trim() || "CRC Comp Pool",
        focus: focus.trim() || null,
        published,
        sets: [{ content, title: null, distance: null }],
      })) as { id?: string }
      if (practice?.id) {
        router.replace(`/practices/${practice.id}`)
      } else {
        router.replace("/practices")
      }
    } catch (err) {
      Alert.alert(
        "Could not create practice",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPad }}>
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Tuesday PM"
        />
        <DateSelector
          label="Date"
          value={date}
          onChange={setDate}
          placeholder="Choose a date"
          optional
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TimeSelector
              label="Start time"
              value={startTime}
              onChange={(value) => {
                setStartTime(value)
                setEndTime((current) => endAfterStart(value, current))
              }}
              helperText={`15-minute intervals · ${timeZoneLabel}`}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeSelector
              label="End time"
              value={endTime}
              onChange={setEndTime}
              helperText="Must be after start"
              min={startTime}
              minExclusive
            />
          </View>
        </View>
        <TextField
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="CRC Comp Pool"
        />
        <TextField
          label="Focus"
          value={focus}
          onChangeText={setFocus}
          placeholder="Speed / endurance…"
        />
        <TextField
          label="Set content"
          value={setContent}
          onChangeText={setSetContent}
          placeholder="Warmup 800 free…"
          multiline
          style={{ minHeight: 88, textAlignVertical: "top" }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Body style={{ fontWeight: "600" }}>Published</Body>
            <Muted>Visible to athletes when on</Muted>
          </View>
          <Switch
            value={published}
            onValueChange={setPublished}
            trackColor={{
              false: c.switchTrack,
              true: c.primary,
            }}
            thumbColor={c.switchThumb}
          />
        </View>
        <Button
          label="Create practice"
          loading={saving}
          onPress={() => void onCreate()}
        />
      </ScrollView>
    </Screen>
  )
}

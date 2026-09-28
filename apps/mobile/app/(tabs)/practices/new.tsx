import { useState } from "react"
import { Alert, Switch, View } from "react-native"
import { useRouter } from "expo-router"
import {
  Body,
  Button,
  Chip,
  Muted,
  Screen,
  ScrollView,
  TextField,
  usePalette,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { COURSES, getViewerTimeZone } from "@swimbuzz/shared"
import { DateSelector, TimeSelector, TimeZoneSelector } from "../../../src/components/DateTimeSelector"
import { UndoRedoButtons } from "../../../src/components/UndoRedoButtons"
import { api } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { useUndoableState } from "../../../src/lib/use-undoable-state"

type NewPracticeForm = {
  title: string
  date: string
  startTime: string
  endTime: string
  location: string
  course: (typeof COURSES)[number]
  focus: string
  setContent: string
  published: boolean
  timeZone: string
}

function emptyForm(): NewPracticeForm {
  return {
    title: "",
    date: "",
    startTime: "19:30",
    endTime: "21:00",
    location: "CRC Comp Pool",
    course: "SCY",
    focus: "",
    setContent: "",
    published: false,
    timeZone: getViewerTimeZone(),
  }
}

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
  const { value: form, set: setForm, undo, redo, canUndo, canRedo } = useUndoableState(emptyForm())
  const [saving, setSaving] = useState(false)

  async function onCreate() {
    const trimmedTitle = form.title.trim()
    if (!trimmedTitle) {
      Alert.alert("Title required", "Enter a practice title.")
      return
    }
    if (form.date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(form.date.trim())) {
      Alert.alert("Invalid date", "Select a date or leave it blank.")
      return
    }
    const start = form.startTime.trim() || "19:30"
    const end = form.endTime.trim() || "21:00"
    if ((clockToMinutes(end) ?? 0) <= (clockToMinutes(start) ?? 0)) {
      Alert.alert("Invalid end time", "End time must be after start time.")
      return
    }
    const content = form.setContent.trim()
    if (!content) {
      Alert.alert("Set required", "Add at least one set’s workout content.")
      return
    }
    setSaving(true)
    try {
      const practice = (await api.createPractice({
        title: trimmedTitle,
        date: form.date.trim() || null,
        startTime: start,
        endTime: end,
        timeZone: form.timeZone,
        location: form.location.trim() || "CRC Comp Pool",
        course: form.course,
        focus: form.focus.trim() || null,
        published: form.published,
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
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: spacing.xs }}>
          <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
        </View>
        <TextField
          label="Title"
          value={form.title}
          onChangeText={(title) => setForm((f) => ({ ...f, title }), "title")}
          placeholder="Tuesday PM"
        />
        <DateSelector
          label="Date"
          value={form.date}
          onChange={(date) => setForm((f) => ({ ...f, date }))}
          placeholder="Choose a date"
          optional
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TimeSelector
              label="Start time"
              value={form.startTime}
              onChange={(value) =>
                setForm((f) => ({ ...f, startTime: value, endTime: endAfterStart(value, f.endTime) }))
              }
              helperText="15-minute intervals"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeSelector
              label="End time"
              value={form.endTime}
              onChange={(endTime) => setForm((f) => ({ ...f, endTime }))}
              helperText="Must be after start"
              min={form.startTime}
              minExclusive
            />
          </View>
        </View>
        <TimeZoneSelector
          label="Time zone"
          value={form.timeZone}
          onChange={(timeZone) => setForm((f) => ({ ...f, timeZone }))}
        />
        <TextField
          label="Location"
          value={form.location}
          onChangeText={(location) => setForm((f) => ({ ...f, location }), "location")}
          placeholder="CRC Comp Pool"
        />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginBottom: spacing.sm,
          }}
        >
          {COURSES.map((course) => (
            <Chip
              key={course}
              label={course}
              selected={form.course === course}
              onPress={() => setForm((f) => ({ ...f, course }))}
            />
          ))}
        </View>
        <TextField
          label="Focus"
          value={form.focus}
          onChangeText={(focus) => setForm((f) => ({ ...f, focus }), "focus")}
          placeholder="Speed / endurance…"
        />
        <TextField
          label="Set content"
          value={form.setContent}
          onChangeText={(setContent) => setForm((f) => ({ ...f, setContent }), "setContent")}
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
            value={form.published}
            onValueChange={(published) => setForm((f) => ({ ...f, published }))}
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

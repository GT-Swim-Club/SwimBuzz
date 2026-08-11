import { useState } from "react"
import { Alert, ScrollView, Switch, View } from "react-native"
import { useRouter } from "expo-router"
import {
  Body,
  Button,
  Muted,
  Screen,
  TextField,
  Title,
} from "@swimbuzz/ui"
import { colors, spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"

export default function NewPracticeScreen() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("19:30")
  const [endTime, setEndTime] = useState("21:00")
  const [location, setLocation] = useState("CRC Comp Pool")
  const [focus, setFocus] = useState("")
  const [setContent, setSetContent] = useState("")
  const [published, setPublished] = useState(false)
  const [saving, setSaving] = useState(false)

  async function onCreate() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      Alert.alert("Title required", "Enter a practice title.")
      return
    }
    if (date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD or leave date blank.")
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
        startTime: startTime.trim() || "19:30",
        endTime: endTime.trim() || "21:00",
        location: location.trim() || "CRC Comp Pool",
        focus: focus.trim() || null,
        published,
        sets: [{ content, title: null, notes: null, distance: null }],
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
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Title>New practice</Title>

        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Tuesday PM"
        />
        <TextField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Start time"
          value={startTime}
          onChangeText={setStartTime}
          placeholder="19:30"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="End time"
          value={endTime}
          onChangeText={setEndTime}
          placeholder="21:00"
          autoCapitalize="none"
          autoCorrect={false}
        />
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
              false: colors.light.fill,
              true: colors.light.primary,
            }}
            thumbColor={colors.light.bgContainer}
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

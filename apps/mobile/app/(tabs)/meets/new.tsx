import { useCallback, useState } from "react"
import { Alert, ScrollView, View } from "react-native"
import { useFocusEffect, useRouter } from "expo-router"
import {
  Button,
  Chip,
  Screen,
  TextField,
  Title,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { DateSelector } from "../../../src/components/DateTimeSelector"
import { api } from "../../../src/lib/api"

const COURSES = ["SCY", "LCM"] as const

export default function NewMeetScreen() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [course, setCourse] = useState<(typeof COURSES)[number]>("SCY")
  const [season, setSeason] = useState("")
  const [seasons, setSeasons] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        try {
          const list = await api.listSeasons()
          if (cancelled) return
          setSeasons(list)
          setSeason((prev) => prev || list[0] || "")
        } catch {
          // Season can still be typed manually.
        }
      })()
      return () => {
        cancelled = true
      }
    }, [])
  )

  async function onCreate() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      Alert.alert("Name required", "Enter a meet name.")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
      Alert.alert("Start date required", "Select a start date.")
      return
    }
    if (endDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
      Alert.alert("Invalid end date", "Select an end date or leave it blank.")
      return
    }
    if (endDate.trim() && endDate.trim() < startDate.trim()) {
      Alert.alert("Invalid end date", "End date must be on or after the start date.")
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: trimmedName,
        location: location.trim() || null,
        startDate: startDate.trim(),
        course,
      }
      if (endDate.trim()) body.endDate = endDate.trim()
      if (season.trim()) body.season = season.trim()
      const meet = await api.createMeet(body)
      router.replace(`/meets/${meet.id}`)
    } catch (err) {
      Alert.alert(
        "Could not create meet",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Title>New meet</Title>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="GT vs …"
          autoCapitalize="words"
        />
        <TextField
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="Atlanta, GA"
        />
        <DateSelector
          label="Start date"
          value={startDate}
          onChange={(value) => {
            setStartDate(value)
            if (endDate && value && endDate < value) setEndDate(value)
          }}
          placeholder="Choose a start date"
        />
        <DateSelector
          label="End date"
          value={endDate}
          onChange={setEndDate}
          placeholder="Choose an end date"
          optional
          min={startDate || undefined}
        />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginBottom: spacing.sm,
          }}
        >
          {COURSES.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={course === c}
              onPress={() => setCourse(c)}
            />
          ))}
        </View>
        <TextField
          label="Season"
          value={season}
          onChangeText={setSeason}
          placeholder="2025-2026"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {seasons.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: spacing.md,
            }}
          >
            {seasons.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={season === s}
                onPress={() => setSeason(s)}
              />
            ))}
          </View>
        ) : null}
        <Button label="Create meet" loading={saving} onPress={() => void onCreate()} />
      </ScrollView>
    </Screen>
  )
}

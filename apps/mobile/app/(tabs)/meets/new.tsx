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
      Alert.alert("Start date required", "Use YYYY-MM-DD for the start date.")
      return
    }
    if (endDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
      Alert.alert("Invalid end date", "Use YYYY-MM-DD or leave end date blank.")
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
        <TextField
          label="Start date"
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="End date (optional)"
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
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

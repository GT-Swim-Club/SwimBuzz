import { useCallback, useState } from "react"
import { Alert, View } from "react-native"
import { useFocusEffect, useRouter } from "expo-router"
import {
  Button,
  Chip,
  Screen,
  ScrollView,
  TextField,
} from "@swimbuzz/ui"
import { defaultSeason, formatSeasonLabel } from "@swimbuzz/shared"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"

const GENDERS = [
  { value: "M", label: "Men" },
  { value: "F", label: "Women" },
] as const

export default function NewAthleteScreen() {
  const router = useRouter()
  const tabBarPad = useTabBarScrollPadding()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [gender, setGender] = useState<"M" | "F">("M")
  const [season, setSeason] = useState("")
  const [seasons, setSeasons] = useState<string[]>([])
  const [swimCloudId, setSwimCloudId] = useState("")
  const [saving, setSaving] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        try {
          const list = await api.listSeasons()
          if (cancelled) return
          setSeasons(list)
          setSeason((prev) => prev || defaultSeason(list) || "")
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
    const fn = firstName.trim()
    const ln = lastName.trim()
    const em = email.trim().toLowerCase()
    const seasonLabel = season.trim()
    if (!fn || !ln || !em) {
      Alert.alert("Required fields", "First name, last name, and email are required.")
      return
    }
    if (!seasonLabel) {
      Alert.alert("Season required", "Enter a season like 2025–2026.")
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        firstName: fn,
        lastName: ln,
        email: em,
        gender,
        seasons: [seasonLabel],
      }
      if (swimCloudId.trim()) body.swimCloudId = swimCloudId.trim()

      const athlete = (await api.createAthlete(body)) as { id?: string }
      if (athlete?.id) {
        router.replace(`/roster/${athlete.id}`)
      } else {
        router.replace("/roster")
      }
    } catch (err) {
      Alert.alert(
        "Could not add athlete",
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
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />
        <TextField
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="athlete@gatech.edu"
        />

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginBottom: spacing.sm,
          }}
        >
          {GENDERS.map((g) => (
            <Chip
              key={g.value}
              label={g.label}
              selected={gender === g.value}
              onPress={() => setGender(g.value)}
            />
          ))}
        </View>

        <TextField
          label="Season"
          value={season}
          onChangeText={setSeason}
          placeholder="2025–2026"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {seasons.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: spacing.sm,
            }}
          >
            {seasons.map((s) => (
              <Chip
                key={s}
                label={formatSeasonLabel(s)}
                selected={season === s}
                onPress={() => setSeason(s)}
              />
            ))}
          </View>
        ) : null}

        <TextField
          label="SwimCloud ID (optional)"
          value={swimCloudId}
          onChangeText={setSwimCloudId}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Button label="Add athlete" loading={saving} onPress={() => void onCreate()} />
      </ScrollView>
    </Screen>
  )
}

import { useCallback, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  View,
} from "react-native"
import { useFocusEffect, useRouter } from "expo-router"
import type { AthleteSummary } from "@swimbuzz/shared"
import { athleteDisplayName, isStaffRole } from "@swimbuzz/shared"
import {
  Button,
  Chip,
  EmptyState,
  FlatList,
  ListRow,
  Muted,
  Screen,
  Section,
  TextField,
  usePalette,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { GalleryTile } from "../../../src/components/GalleryTile"
import { useViewPreferences } from "../../../src/lib/view-preferences"

type GenderFilter = "ALL" | "M" | "F"

export default function RosterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const { defaultView } = useViewPreferences()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const gallery = defaultView === "gallery"
  const [athletes, setAthletes] = useState<AthleteSummary[]>([])
  const [seasons, setSeasons] = useState<string[]>([])
  const [season, setSeason] = useState<string | null>(null)
  const [gender, setGender] = useState<GenderFilter>("ALL")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [data, seasonList] = await Promise.all([
        api.listAthletes(),
        api.listSeasons().catch(() => [] as string[]),
      ])
      setAthletes(data)
      const fromAthletes = Array.from(
        new Set(data.flatMap((a) => a.seasons ?? []).filter(Boolean))
      ).sort((a, b) => b.localeCompare(a))
      const merged =
        seasonList.length > 0
          ? Array.from(new Set([...seasonList, ...fromAthletes])).sort((a, b) =>
              b.localeCompare(a)
            )
          : fromAthletes
      setSeasons(merged)
      setSeason((prev) => {
        if (prev && merged.includes(prev)) return prev
        return null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roster")
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return athletes.filter((athlete) => {
      if (gender !== "ALL" && athlete.gender !== gender) return false
      if (season && !(athlete.seasons ?? []).includes(season)) return false
      if (q) {
        const name = athleteDisplayName(athlete).toLowerCase()
        const nick = (athlete.nicknames ?? []).join(" ").toLowerCase()
        if (!name.includes(q) && !nick.includes(q)) return false
      }
      return true
    })
  }, [athletes, gender, query, season])

  async function syncSeasonTimes() {
    if (!season) {
      Alert.alert("Pick a season", "Select a season chip before syncing times.")
      return
    }
    const ids = filtered.map((a) => a.id).filter(Boolean)
    if (ids.length === 0) {
      Alert.alert("No athletes", "No athletes match the current filters.")
      return
    }
    setSyncing(true)
    try {
      const result = (await api.syncTimes({
        season,
        athleteIds: ids,
        gender: gender === "ALL" ? "all" : gender,
      })) as { message?: string; athletesSynced?: number; imported?: number }
      Alert.alert(
        "Sync finished",
        result.message ??
          `Synced ${result.athletesSynced ?? 0} athletes · ${result.imported ?? 0} new swims`
      )
      await load()
    } catch (err) {
      Alert.alert(
        "Sync failed",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Screen style={{ paddingBottom: 0 }}>
      {isStaff ? (
        <View style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
          <Button
            label="Add athlete"
            onPress={() => router.push("/roster/new")}
          />
          {season ? (
            <Button
              label={`Sync SwimCloud times (${season})`}
              variant="secondary"
              loading={syncing}
              onPress={() => void syncSeasonTimes()}
            />
          ) : (
            <Muted>Select a season to sync SwimCloud times.</Muted>
          )}
        </View>
      ) : null}
      <TextField
        label="Search"
        placeholder="Search by name"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <Section title="Gender">
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {(
            [
              ["ALL", "All"],
              ["M", "M"],
              ["F", "F"],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              selected={gender === value}
              onPress={() => setGender(value)}
            />
          ))}
        </View>
      </Section>
      {seasons.length > 0 ? (
        <Section title="Season">
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Chip
              label="All"
              selected={season == null}
              onPress={() => setSeason(null)}
            />
            {seasons.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={season === s}
                onPress={() => setSeason(s)}
              />
            ))}
          </View>
        </Section>
      ) : null}
      {loading && athletes.length === 0 ? (
        <View style={{ paddingTop: 40 }}>
          <ActivityIndicator color={c.primaryActive} />
        </View>
      ) : (
        <FlatList
          key={gallery ? "gallery" : "list"}
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={gallery ? 2 : 1}
          contentContainerStyle={{ paddingBottom: tabBarPad }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} />
          }
          ListEmptyComponent={
            <EmptyState
              title={
                error
                  ? "Could not load roster"
                  : athletes.length === 0
                    ? "No athletes"
                    : "No matching athletes"
              }
              body={error ?? undefined}
            />
          }
          renderItem={({ item }) =>
            gallery ? (
              <GalleryTile
                title={athleteDisplayName(item)}
                subtitle={[item.gender, item.seasons?.[0]].filter(Boolean).join(" · ")}
                onPress={() => router.push(`/roster/${item.id}`)}
              />
            ) : (
              <ListRow
                title={athleteDisplayName(item)}
                subtitle={[item.gender, item.seasons?.[0]].filter(Boolean).join(" · ")}
                onPress={() => router.push(`/roster/${item.id}`)}
              />
            )
          }
        />
      )}
    </Screen>
  )
}

import { useMemo, useState } from "react"
import {
  Alert,
  RefreshControl,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { athleteDisplayName, formatSeasonLabel, isStaffRole } from "@swimbuzz/shared"
import {
  Button,
  CardSkeleton,
  Chip,
  EmptyState,
  FlatList,
  ListRow,
  ListRowSkeleton,
  Muted,
  Screen,
  Section,
  TextField,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { GalleryTile } from "../../../src/components/GalleryTile"
import { StaffBadge } from "../../../src/components/StaffBadge"
import { useViewPreferences } from "../../../src/lib/view-preferences"

type GenderFilter = "ALL" | "M" | "F"

export default function RosterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const { defaultView } = useViewPreferences()
  const tabBarPad = useTabBarScrollPadding()
  const gallery = defaultView === "gallery"
  const [seasonState, setSeasonState] = useState<string | null>(null)
  const [gender, setGender] = useState<GenderFilter>("ALL")
  const [query, setQuery] = useState("")
  const [syncing, setSyncing] = useState(false)

  const {
    data: athletes = [],
    isPending,
    isFetching: athletesFetching,
    error,
    refetch: refetchAthletes,
  } = useQuery({ queryKey: ["athletes"], queryFn: () => api.listAthletes() })

  const { data: seasonList = [], refetch: refetchSeasons } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.listSeasons(),
  })

  const seasons = useMemo(() => {
    const fromAthletes = Array.from(
      new Set(athletes.flatMap((a) => a.seasons ?? []).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a))
    return seasonList.length > 0
      ? Array.from(new Set([...seasonList, ...fromAthletes])).sort((a, b) =>
          b.localeCompare(a)
        )
      : fromAthletes
  }, [athletes, seasonList])

  const season = seasonState && seasons.includes(seasonState) ? seasonState : null
  const isFetching = athletesFetching
  const load = () => Promise.all([refetchAthletes(), refetchSeasons()])

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
          <Button
            label="Import roster (Google Sheets)"
            variant="secondary"
            onPress={() => router.push("/roster/import-sheet")}
          />
          {season ? (
            <Button
              label={`Sync SwimCloud times (${formatSeasonLabel(season)})`}
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
              onPress={() => setSeasonState(null)}
            />
            {seasons.map((s) => (
              <Chip
                key={s}
                label={formatSeasonLabel(s)}
                selected={season === s}
                onPress={() => setSeasonState(s)}
              />
            ))}
          </View>
        </Section>
      ) : null}
      {isPending ? (
        gallery ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {[...Array(6)].map((_, i) => (
              <View key={i} style={{ width: "47%" }}>
                <CardSkeleton />
              </View>
            ))}
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {[...Array(6)].map((_, i) => (
              <ListRowSkeleton key={i} />
            ))}
          </View>
        )
      ) : (
        <FlatList
          key={gallery ? "gallery" : "list"}
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={gallery ? 2 : 1}
          contentContainerStyle={{ paddingBottom: tabBarPad }}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={load} />
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
              body={error instanceof Error ? error.message : undefined}
            />
          }
          renderItem={({ item }) =>
            gallery ? (
              <GalleryTile
                title={athleteDisplayName(item)}
                titleAdornment={
                  item.user?.staffTitle ? <StaffBadge title={item.user.staffTitle} /> : undefined
                }
                subtitle={[item.gender, item.seasons?.[0] && formatSeasonLabel(item.seasons[0])].filter(Boolean).join(" · ")}
                onPress={() => router.push(`/roster/${item.id}`)}
              />
            ) : (
              <ListRow
                title={athleteDisplayName(item)}
                titleAdornment={
                  item.user?.staffTitle ? <StaffBadge title={item.user.staffTitle} /> : undefined
                }
                subtitle={[item.gender, item.seasons?.[0] && formatSeasonLabel(item.seasons[0])].filter(Boolean).join(" · ")}
                onPress={() => router.push(`/roster/${item.id}`)}
              />
            )
          }
        />
      )}
    </Screen>
  )
}

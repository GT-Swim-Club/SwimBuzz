import { useCallback, useMemo, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native"
import { useFocusEffect, useRouter } from "expo-router"
import type { MeetSummary } from "@swimbuzz/shared"
import { formatMeetDateRange, isStaffRole } from "@swimbuzz/shared"
import {
  Button,
  Chip,
  EmptyState,
  ListRow,
  Screen,
  Section,
  TextField,
  Title,
} from "@swimbuzz/ui"
import { colors, spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"

export default function MeetsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const [meets, setMeets] = useState<MeetSummary[]>([])
  const [seasons, setSeasons] = useState<string[]>([])
  const [season, setSeason] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [data, seasonList] = await Promise.all([
        api.listMeets(),
        api.listSeasons().catch(() => [] as string[]),
      ])
      setMeets(data)
      const fromMeets = Array.from(
        new Set(data.map((m) => m.season).filter(Boolean))
      ).sort((a, b) => b.localeCompare(a))
      const merged =
        seasonList.length > 0
          ? Array.from(new Set([...seasonList, ...fromMeets])).sort((a, b) =>
              b.localeCompare(a)
            )
          : fromMeets
      setSeasons(merged)
      setSeason((prev) => {
        if (prev && merged.includes(prev)) return prev
        return null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meets")
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
    return meets.filter((meet) => {
      if (season && meet.season !== season) return false
      if (q && !meet.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [meets, query, season])

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <Title>Meets</Title>
      {isStaff ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Button label="New meet" onPress={() => router.push("/meets/new")} />
        </View>
      ) : null}
      <TextField
        label="Search"
        placeholder="Search meets by name"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
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
      {loading && meets.length === 0 ? (
        <View style={{ paddingTop: 40 }}>
          <ActivityIndicator color={colors.light.primaryActive} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} />
          }
          ListEmptyComponent={
            <EmptyState
              title={
                error
                  ? "Could not load meets"
                  : meets.length === 0
                    ? "No meets yet"
                    : "No matching meets"
              }
              body={error ?? undefined}
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={[
                formatMeetDateRange(item.startDate, item.endDate),
                item.location,
                item.course,
                item.season,
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => router.push(`/meets/${item.id}`)}
            />
          )}
        />
      )}
    </Screen>
  )
}

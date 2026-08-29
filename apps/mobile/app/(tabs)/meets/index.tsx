import { useMemo, useState } from "react"
import {
  RefreshControl,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { formatFullDate, formatMeetDateRange, isStaffRole, zonedDayKey } from "@swimbuzz/shared"
import {
  Button,
  CardSkeleton,
  Chip,
  EmptyState,
  FlatList,
  ListRow,
  ListRowSkeleton,
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
import { RelativeDateText } from "../../../src/components/RelativeDateText"
import { useViewPreferences } from "../../../src/lib/view-preferences"

export default function MeetsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const { defaultView } = useViewPreferences()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const gallery = defaultView === "gallery"
  const [seasonState, setSeasonState] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const {
    data: meets = [],
    isPending,
    isFetching: meetsFetching,
    error,
    refetch: refetchMeets,
  } = useQuery({ queryKey: ["meets"], queryFn: () => api.listMeets() })

  const { data: seasonList = [], refetch: refetchSeasons } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.listSeasons(),
  })

  const seasons = useMemo(() => {
    const fromMeets = Array.from(
      new Set(meets.map((m) => m.season).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a))
    return seasonList.length > 0
      ? Array.from(new Set([...seasonList, ...fromMeets])).sort((a, b) =>
          b.localeCompare(a)
        )
      : fromMeets
  }, [meets, seasonList])

  // Falls back to "All" once the selected season drops out of the list,
  // instead of tracking that reset in an effect.
  const season = seasonState && seasons.includes(seasonState) ? seasonState : null

  const isFetching = meetsFetching
  const onRefresh = () => {
    void refetchMeets()
    void refetchSeasons()
  }

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
              onPress={() => setSeasonState(null)}
            />
            {seasons.map((s) => (
              <Chip
                key={s}
                label={s}
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
            <RefreshControl refreshing={isFetching} onRefresh={onRefresh} />
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
              body={error instanceof Error ? error.message : undefined}
            />
          }
          renderItem={({ item }) => {
            const absoluteRange = formatMeetDateRange(item.startsAt, item.endsAt, item.timeZone)
            // Only a single-day meet collapses to "Today" — a multi-day range always
            // stays absolute, since a relative label would silently drop the end date.
            const singleDay =
              !item.endsAt || zonedDayKey(item.startsAt, item.timeZone) === zonedDayKey(item.endsAt, item.timeZone)
            const dateSegment = (style: { fontSize: number; color: string }) =>
              singleDay ? (
                <RelativeDateText
                  value={item.startsAt}
                  kind="event"
                  timeZone={item.timeZone}
                  absolute={formatFullDate(item.startsAt, item.timeZone)}
                  style={style}
                />
              ) : (
                absoluteRange
              )
            return gallery ? (
              <GalleryTile
                title={item.name}
                subtitleSegments={[
                  dateSegment({ fontSize: 12, color: c.textSecondary }),
                  item.location,
                  item.course,
                  item.season,
                ]}
                onPress={() => router.push(`/meets/${item.id}`)}
              />
            ) : (
              <ListRow
                title={item.name}
                subtitleSegments={[
                  dateSegment({ fontSize: 13, color: c.textSecondary }),
                  item.location,
                  item.course,
                  item.season,
                ]}
                onPress={() => router.push(`/meets/${item.id}`)}
              />
            )
          }}
        />
      )}
    </Screen>
  )
}

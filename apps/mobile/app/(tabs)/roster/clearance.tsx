import { useMemo, useState } from "react"
import { RefreshControl, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import {
  athleteDisplayName,
  CLEARANCE_CHECK_LABEL,
  CLEARANCE_CHECKS,
  defaultSeason,
  formatClearanceDate,
  formatSeasonLabel,
  isStaffRole,
  missingClearance,
  type ClearanceListAthlete,
} from "@swimbuzz/shared"
import {
  Chip,
  EmptyState,
  ErrorBlock,
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
import { ClearanceBadge } from "../../../src/components/ClearanceBadge"

type Show = "uncleared" | "all"

function checksSummary(a: ClearanceListAthlete): string {
  return CLEARANCE_CHECKS.map((check) => {
    const item = a[check]
    const value = item.cleared ? (formatClearanceDate(item.date) ?? "on file") : "not on file"
    return `${CLEARANCE_CHECK_LABEL[check]}: ${value}`
  }).join(" · ")
}

/**
 * Staff: physical & concussion clearance for a season's roster — defaults to the
 * athletes still missing one. Corrections happen on the athlete's screen; the
 * sheet import is on the web roster (Clearance → Import).
 */
export default function ClearanceScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const tabBarPad = useTabBarScrollPadding()
  const params = useLocalSearchParams<{ season?: string }>()
  const [seasonState, setSeasonState] = useState<string | null>(params.season ?? null)
  const [show, setShow] = useState<Show>("uncleared")
  const [query, setQuery] = useState("")

  const { data: seasons = [] } = useQuery({ queryKey: ["seasons"], queryFn: () => api.listSeasons() })
  const season = seasonState ?? defaultSeason(seasons) ?? null

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["clearance", season],
    queryFn: () => api.listClearance(season as string),
    enabled: isStaff && !!season,
  })

  const athletes = useMemo(() => data?.athletes ?? [], [data])
  const uncleared = useMemo(
    () => athletes.filter((a) => missingClearance(a).length > 0),
    [athletes]
  )
  const rows = useMemo(() => {
    const pool = show === "all" ? athletes : uncleared
    const q = query.trim().toLowerCase()
    return q ? pool.filter((a) => athleteDisplayName(a).toLowerCase().includes(q)) : pool
  }, [athletes, uncleared, show, query])

  if (!isStaff) {
    return (
      <Screen>
        <ErrorBlock message="Only coaches and execs can see clearance." />
      </Screen>
    )
  }

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <Muted style={{ marginBottom: spacing.sm }}>
        {athletes.length === 0
          ? "Physical on file and concussion baseline test, per season."
          : uncleared.length === 0
            ? `All ${athletes.length} athletes are cleared.`
            : `${uncleared.length} of ${athletes.length} not cleared. Import the clearance sheet from the web roster.`}
      </Muted>
      <TextField
        label="Search"
        placeholder="Search by name"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <Section title="Show">
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Chip label={`Not cleared (${uncleared.length})`} selected={show === "uncleared"} onPress={() => setShow("uncleared")} />
          <Chip label={`Everyone (${athletes.length})`} selected={show === "all"} onPress={() => setShow("all")} />
        </View>
      </Section>
      {seasons.length > 1 ? (
        <Section title="Season">
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {seasons.map((s) => (
              <Chip key={s} label={formatSeasonLabel(s)} selected={season === s} onPress={() => setSeasonState(s)} />
            ))}
          </View>
        </Section>
      ) : null}
      {isPending && !!season ? (
        <View style={{ gap: spacing.sm }}>
          {[...Array(6)].map((_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.athleteId}
          contentContainerStyle={{ paddingBottom: tabBarPad }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} />}
          ListEmptyComponent={
            <EmptyState
              title={
                error
                  ? "Could not load clearance"
                  : query
                    ? "No matching athletes"
                    : show === "uncleared" && athletes.length > 0
                      ? "Everyone is cleared"
                      : "No athletes this season"
              }
              body={error instanceof Error ? error.message : undefined}
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={athleteDisplayName(item)}
              titleAdornment={<ClearanceBadge missing={missingClearance(item)} />}
              subtitle={checksSummary(item)}
              onPress={() => router.push(`/roster/${item.athleteId}`)}
            />
          )}
        />
      )}
    </Screen>
  )
}

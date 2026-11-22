import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import * as Sharing from "expo-sharing"
import { File, Paths } from "expo-file-system"
import {
  athleteDisplayName,
  formatSeasonLabel,
  isStaffRole,
  rosterPdfFilename,
  type AthleteSummary,
} from "@swimbuzz/shared"
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
  usePalette,
} from "@swimbuzz/ui"
import { radii, spacing } from "@swimbuzz/tokens"
import { api, API_URL, getAccessToken } from "../../../src/lib/api"
import { Icon } from "../../../src/components/Icon"
import { useAuth } from "../../../src/lib/auth"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { GalleryTile } from "../../../src/components/GalleryTile"
import { StaffBadge } from "../../../src/components/StaffBadge"
import { AthleteStatusRowIcons } from "../../../src/components/AthleteStatusIcons"
import { useGalleryView } from "../../../src/lib/view-preferences"
import { GalleryViewToggle } from "../../../src/components/GalleryViewToggle"

type GenderFilter = "ALL" | "M" | "F"

/**
 * The roster as the tab shows it (season, gender, search), laid out as a PDF by the API (like the
 * web's Download PDF), ready for the share sheet. No season = every season.
 */
async function rosterPdfFile(params: { season: string | null; gender: GenderFilter; query: string }) {
  const sp = new URLSearchParams()
  if (params.season) sp.set("season", params.season)
  if (params.gender !== "ALL") sp.set("gender", params.gender)
  if (params.query.trim()) sp.set("q", params.query.trim())
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}/api/roster/pdf?${sp.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) throw new Error("Could not create PDF")
  const bytes = new Uint8Array(await res.arrayBuffer())
  const file = new File(Paths.cache, rosterPdfFilename(params.season))
  if (file.exists) file.delete()
  file.write(bytes)
  return file
}

export default function RosterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const [galleryView, setGalleryView] = useGalleryView("roster")
  const tabBarPad = useTabBarScrollPadding()
  const gallery = galleryView === "gallery"
  const [seasonState, setSeasonState] = useState<string | null>(null)
  const [gender, setGender] = useState<GenderFilter>("ALL")
  const [query, setQuery] = useState("")
  const [syncing, setSyncing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const c = usePalette()

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
        // athleteDisplayName includes the preferred name, so this searches both.
        if (!athleteDisplayName(athlete).toLowerCase().includes(q)) return false
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

  async function sharePdf() {
    setSharing(true)
    try {
      const file = await rosterPdfFile({ season, gender, query })
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't open the share sheet.")
        return
      }
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
    } catch (err) {
      Alert.alert("Could not share PDF", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSharing(false)
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
          <Button
            label="Physical & concussion clearance"
            variant="secondary"
            onPress={() =>
              router.push(season ? `/roster/clearance?season=${encodeURIComponent(season)}` : "/roster/clearance")
            }
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
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Search"
            placeholder="Search by name"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <View style={{ height: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm }}>
          <GalleryViewToggle value={galleryView} onChange={setGalleryView} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share PDF of roster"
            accessibilityState={{ busy: sharing }}
            disabled={sharing}
            hitSlop={6}
            onPress={() => void sharePdf()}
            style={({ pressed }) => ({
              alignItems: "center",
              borderRadius: radii.md,
              height: 36,
              justifyContent: "center",
              width: 36,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={c.textSecondary} />
            ) : (
              <Icon name="share" size={18} color={c.textSecondary} />
            )}
          </Pressable>
        </View>
      </View>
      <Section title="Gender">
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {(
            [
              ["ALL", "All"],
              ["F", "F"],
              ["M", "M"],
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
                titleAdornment={<NameAdornment athlete={item} showStatus={isStaff || (!!user && item.userId === user.id)} />}
                subtitle={[item.gender, item.seasons?.[0] && formatSeasonLabel(item.seasons[0])].filter(Boolean).join(" · ")}
                onPress={() => router.push(`/roster/${item.id}`)}
              />
            ) : (
              <ListRow
                title={athleteDisplayName(item)}
                titleAdornment={<NameAdornment athlete={item} showStatus={isStaff || (!!user && item.userId === user.id)} />}
                subtitle={[item.gender, item.seasons?.[0] && formatSeasonLabel(item.seasons[0])]
                  .filter(Boolean)
                  .join(" · ")}
                onPress={() => router.push(`/roster/${item.id}`)}
              />
            )
          }
        />
      )}
    </Screen>
  )
}

/** Staff badge, then — for staff, or on your own row — physical / concussion test / SwimCloud times status icons. */
function NameAdornment({ athlete, showStatus }: { athlete: AthleteSummary; showStatus: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {athlete.user?.staffTitle ? <StaffBadge title={athlete.user.staffTitle} /> : null}
      {showStatus ? (
        <AthleteStatusRowIcons
          clearance={athlete.clearance}
          swimCloudIds={athlete.swimCloudIds}
          timesSyncedAt={athlete.timesSyncedAt ?? null}
        />
      ) : null}
    </View>
  )
}

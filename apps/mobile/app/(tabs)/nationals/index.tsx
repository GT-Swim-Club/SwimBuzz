import { useMemo, useState } from "react"
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import {
  athletePreferredInitials,
  athletePreferredName,
  defaultSeason,
  formatSeasonLabel,
  formatTime,
} from "@swimbuzz/shared"
import { Chip, EmptyState, ErrorBlock, LoadingBlock, Screen, ScrollView, TextField, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { GalleryTile } from "../../../src/components/GalleryTile"
import { RecordsSection } from "../../../src/components/RecordsSection"
import { SegmentedOption, SegmentedToggle } from "../../../src/components/SegmentedToggle"
import { useGalleryView } from "../../../src/lib/view-preferences"
import { GalleryViewToggle } from "../../../src/components/GalleryViewToggle"

type QualifierSwim = {
  id?: string
  event: string
  time?: string
  timeMs?: number
  cut?: string
  cutMs?: number
  meetName?: string
}

type QualifierAthlete = {
  athleteId: string
  athleteSlug?: string | null
  firstName: string
  lastName: string
  preferredName?: string | null
  gender: string
  events: QualifierSwim[]
}

type StandardsRow = { event: string; women: string; men: string }

/** The Nationals tab holds team records too: the native tab bar has no room for a sixth tab on Android. */
const VIEWS = [
  { value: "nationals", label: "Nationals" },
  { value: "records", label: "Records" },
] as const
type TabView = (typeof VIEWS)[number]["value"]

const GENDERS = [
  { value: "all", label: "All" },
  { value: "F", label: "Women" },
  { value: "M", label: "Men" },
] as const
type GenderFilter = (typeof GENDERS)[number]["value"]

function swimTime(swim: QualifierSwim) {
  return swim.time ?? (typeof swim.timeMs === "number" ? formatTime(swim.timeMs) : "")
}

/** How far under the cut a swim is, e.g. "−0.42" — the same label as the web page. */
function marginLabel(swim: QualifierSwim) {
  if (typeof swim.timeMs !== "number" || typeof swim.cutMs !== "number") return ""
  const diff = Math.max(0, swim.cutMs - swim.timeMs)
  if (diff === 0) return "0.00"
  const seconds = diff / 1000
  if (seconds < 60) return `−${seconds.toFixed(2)}`
  return `−${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`
}

function cutsLabel(athlete: QualifierAthlete, showGender: boolean) {
  const cuts = `${athlete.events.length} ${athlete.events.length === 1 ? "cut" : "cuts"}`
  return showGender ? `${athlete.gender === "F" ? "Women" : "Men"} · ${cuts}` : cuts
}

function isBlankCut(value: string | undefined) {
  return !value || value === "--"
}

export default function NationalsScreen() {
  const router = useRouter()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const styles = useMemo(() => makeStyles(c), [c])
  const [galleryView, setGalleryView] = useGalleryView("nationals")
  const gallery = galleryView === "gallery"
  const [seasonState, setSeasonState] = useState<string | null>(null)
  const [course, setCourse] = useState("SCY")
  const [gender, setGender] = useState<GenderFilter>("all")
  const [query, setQuery] = useState("")
  // A "team record" notification opens this tab with ?view=records.
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>()
  const [view, setView] = useState<TabView>(viewParam === "records" ? "records" : "nationals")
  const [seenViewParam, setSeenViewParam] = useState(viewParam)
  if (viewParam !== seenViewParam) {
    setSeenViewParam(viewParam)
    if (viewParam === "records") setView("records")
  }

  const {
    data: seasons = [],
    refetch: refetchSeasons,
    isRefetching: seasonsRefetching,
    isPending: seasonsPending,
  } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.listSeasons(),
  })
  const season = seasonState ?? defaultSeason(seasons) ?? null

  const {
    data: qualifiersData,
    isPending,
    error,
    refetch: refetchQualifiers,
    isRefetching: qualifiersRefetching,
  } = useQuery({
    queryKey: ["qualifiers", season, course],
    queryFn: () => api.getQualifiers({ season: season as string, course }),
    enabled: Boolean(season),
  })
  // Only a genuinely new (season, course) pair shows a spinner — TanStack
  // Query serves cached data for a previously-visited pair instantly.
  const loading = seasonsPending || (Boolean(season) && isPending)
  const refreshing = seasonsRefetching || qualifiersRefetching
  const refresh = () => Promise.all([refetchSeasons(), season ? refetchQualifiers() : null])

  const viewerAthleteId = qualifiersData?.viewerAthleteId ?? null
  // Offer a course switch only when the season has standards in a course other than SCY.
  const courses = useMemo(() => {
    const list = qualifiersData?.courses ?? []
    return list.some((value) => value !== "SCY") ? [...new Set(["SCY", ...list])] : []
  }, [qualifiersData?.courses])

  const set = qualifiersData?.set as { yearLabel?: string | null; course?: string } | null | undefined
  const hasStandards = Boolean(set)
  const standardsTitle = `${set?.yearLabel ? `${set.yearLabel} ` : ""}Nationals Standards`

  const qualifiers = useMemo<QualifierAthlete[]>(
    () => (Array.isArray(qualifiersData?.qualifiers) ? (qualifiersData.qualifiers as QualifierAthlete[]) : []),
    [qualifiersData],
  )
  const genderQualifiers = useMemo(
    () => (gender === "all" ? qualifiers : qualifiers.filter((athlete) => athlete.gender === gender)),
    [qualifiers, gender],
  )

  const needle = query.trim().toLowerCase()

  // Alphabetical from the server, with you first; a search matches names or events.
  const filteredQualifiers = useMemo(() => {
    const matches = needle
      ? genderQualifiers.filter((athlete) => {
          const names = [athlete.firstName, athlete.lastName, athlete.preferredName ?? ""]
          return (
            names.some((name) => name.toLowerCase().includes(needle)) ||
            athlete.events.some((swim) => swim.event.toLowerCase().includes(needle))
          )
        })
      : genderQualifiers
    return [...matches].sort(
      (a, b) => Number(b.athleteId === viewerAthleteId) - Number(a.athleteId === viewerAthleteId),
    )
  }, [genderQualifiers, needle, viewerAthleteId])

  const standardRows = useMemo<StandardsRow[]>(() => {
    const rows = Array.isArray(qualifiersData?.standards) ? qualifiersData.standards : []
    return rows.filter((row) => {
      if (needle && !row.event.toLowerCase().includes(needle)) return false
      if (gender === "F") return !isBlankCut(row.women)
      if (gender === "M") return !isBlankCut(row.men)
      return true
    })
  }, [qualifiersData, needle, gender])

  const cutCount = genderQualifiers.reduce((sum, athlete) => sum + athlete.events.length, 0)
  const showGender = gender === "all"
  const openAthlete = (athlete: QualifierAthlete) => router.push(`/roster/${athlete.athleteSlug || athlete.athleteId}`)

  const viewSwitch = (
    <SegmentedToggle selectedIndex={VIEWS.findIndex((v) => v.value === view)} fill style={styles.viewSwitch}>
      {VIEWS.map((v) => (
        <SegmentedOption
          key={v.value}
          flex
          selected={v.value === view}
          accessibilityLabel={v.label}
          onPress={() => setView(v.value)}
        >
          <Text style={[styles.toggleText, v.value === view && styles.toggleTextOn]}>{v.label}</Text>
        </SegmentedOption>
      ))}
    </SegmentedToggle>
  )

  if (view === "records") {
    return (
      <Screen style={styles.screen}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: tabBarPad }]}
          showsVerticalScrollIndicator={false}
        >
          {viewSwitch}
          <RecordsSection />
        </ScrollView>
      </Screen>
    )
  }

  function renderStandards() {
    if (standardRows.length === 0) return null
    const both = gender === "all"
    return (
      <View style={styles.group}>
        <Text style={styles.groupTitle}>{standardsTitle.toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={[styles.standardRow, styles.standardHead]}>
            {both ? <Text style={[styles.columnLabel, styles.sideCell]}>WOMEN</Text> : null}
            <Text style={[styles.columnLabel, styles.eventCell]}>EVENT</Text>
            <Text style={[styles.columnLabel, styles.sideCell]}>{both ? "MEN" : gender === "F" ? "WOMEN" : "MEN"}</Text>
          </View>
          {standardRows.map((row, index) => {
            const cell = (value: string) => (
              <Text style={[styles.sideCell, isBlankCut(value) ? styles.blankCut : styles.cutTime]}>
                {isBlankCut(value) ? "—" : value}
              </Text>
            )
            return (
              <View key={`${row.event}|${index}`} style={[styles.standardRow, index > 0 && styles.rowDivider]}>
                {both ? cell(row.women) : null}
                <Text style={[styles.eventCell, styles.standardEvent]}>{row.event}</Text>
                {cell(both ? row.men : gender === "F" ? row.women : row.men)}
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  function renderQualifiers() {
    if (filteredQualifiers.length === 0) {
      return (
        <EmptyState
          title={needle ? "No matching qualifiers" : "No qualifiers yet"}
          body={
            needle
              ? `No qualifiers match “${query.trim()}”.`
              : "No athletes have an individual Nationals cut this season yet. The standards are below."
          }
        />
      )
    }
    if (gallery) {
      return (
        <View style={styles.galleryGrid}>
          {filteredQualifiers.map((athlete) => {
            const isMe = athlete.athleteId === viewerAthleteId
            const events = athlete.events.map((swim) => swim.event).join(", ")
            return (
              <View key={athlete.athleteId} style={styles.galleryItem}>
                <GalleryTile
                  title={athletePreferredName(athlete)}
                  titleAdornment={isMe ? <YouPill styles={styles} /> : undefined}
                  subtitle={`${cutsLabel(athlete, showGender)} · ${events}`}
                  onPress={() => openAthlete(athlete)}
                />
              </View>
            )
          })}
        </View>
      )
    }
    return (
      <View style={[styles.card, styles.listCard]}>
        {filteredQualifiers.map((athlete, index) => {
          const name = athletePreferredName(athlete)
          const isMe = athlete.athleteId === viewerAthleteId
          return (
            <Pressable
              key={athlete.athleteId}
              accessibilityRole="button"
              accessibilityLabel={`View ${name}'s profile`}
              onPress={() => openAthlete(athlete)}
              style={({ pressed }) => [
                styles.athleteRow,
                index > 0 && styles.rowDivider,
                isMe && styles.meRow,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.athleteHead}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{athletePreferredInitials(athlete)}</Text>
                </View>
                <View style={styles.athleteContent}>
                  <View style={styles.nameLine}>
                    <Text numberOfLines={1} style={styles.athleteName}>
                      {name}
                    </Text>
                    {isMe ? <YouPill styles={styles} /> : null}
                  </View>
                  <Text style={styles.athleteMeta}>{cutsLabel(athlete, showGender)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
              <View style={styles.cutLines}>
                {athlete.events.map((swim, swimIndex) => {
                  const margin = marginLabel(swim)
                  return (
                    <View key={swim.id ?? `${swim.event}-${swimIndex}`} style={styles.cutLine}>
                      <Text numberOfLines={1} style={styles.cutEvent}>
                        {swim.event}
                      </Text>
                      <Text style={styles.cutTimeText}>
                        {swimTime(swim)}
                        {margin ? <Text style={styles.cutMargin}>{`  ${margin}`}</Text> : null}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </Pressable>
          )
        })}
      </View>
    )
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        {viewSwitch}

        {seasons.length > 0 ? (
          <ScrollView horizontal contentContainerStyle={styles.chipRow}>
            {seasons.map((label) => (
              <Chip
                key={label}
                label={formatSeasonLabel(label)}
                selected={season === label}
                onPress={() => {
                  setSeasonState(label)
                  // Courses differ by season; start each season on SCY.
                  setCourse("SCY")
                }}
              />
            ))}
            {courses.map((value) => (
              <Chip key={value} label={value} selected={course === value} onPress={() => setCourse(value)} />
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.filterRow}>
          <SegmentedToggle
            selectedIndex={GENDERS.findIndex((g) => g.value === gender)}
            fill
            style={styles.genderSwitch}
          >
            {GENDERS.map((g) => (
              <SegmentedOption
                key={g.value}
                flex
                selected={g.value === gender}
                accessibilityLabel={g.value === "all" ? "All qualifiers" : `${g.label} qualifiers`}
                onPress={() => setGender(g.value)}
              >
                <Text style={[styles.toggleText, g.value === gender && styles.toggleTextOn]}>{g.label}</Text>
              </SegmentedOption>
            ))}
          </SegmentedToggle>
          <GalleryViewToggle value={galleryView} onChange={setGalleryView} />
        </View>

        <TextField
          label="Search"
          placeholder="Search by name or event"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        {error ? <ErrorBlock message={error instanceof Error ? error.message : "Failed to load qualifiers"} /> : null}

        {loading ? (
          <View style={styles.card}>
            <LoadingBlock />
          </View>
        ) : !season ? (
          <EmptyState title="No seasons yet" />
        ) : !hasStandards ? (
          <EmptyState
            title={`No standards for ${formatSeasonLabel(season)}`}
            body={
              course === "SCY"
                ? "Coaches haven't uploaded the Nationals qualifying times for this season yet."
                : `No ${course} qualifying times for this season.`
            }
          />
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View>
                <Text style={styles.summaryNumber}>{genderQualifiers.length}</Text>
                <Text style={styles.summaryLabel}>{genderQualifiers.length === 1 ? "qualifier" : "qualifiers"}</Text>
              </View>
              <View style={styles.summaryRule} />
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>{standardsTitle}</Text>
                <Text style={styles.summaryDetail}>
                  {`${set?.course ?? course} · ${cutCount} ${cutCount === 1 ? "cut" : "cuts"}`}
                </Text>
              </View>
            </View>

            {renderQualifiers()}
            {renderStandards()}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function YouPill({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.youPill}>
      <Text style={styles.youPillText}>You</Text>
    </View>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    screen: { paddingBottom: 0 },
    content: {},
    viewSwitch: { alignSelf: "stretch", marginBottom: spacing.md },
    filterRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    genderSwitch: { flex: 1, minWidth: 0 },
    toggleText: { color: c.textSecondary, fontSize: 14, fontWeight: "700" },
    toggleTextOn: { color: c.primaryContrast },
    chipRow: {
      alignItems: "center",
      paddingBottom: spacing.sm,
      paddingRight: spacing.sm,
    },
    card: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: "hidden",
    },
    listCard: { marginBottom: spacing.lg },
    summaryCard: {
      alignItems: "center",
      backgroundColor: c.primaryBg,
      borderColor: c.primaryBorderHover,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: "row",
      marginBottom: spacing.md,
      padding: spacing.sm,
    },
    summaryNumber: {
      color: c.primaryText,
      fontSize: 27,
      fontVariant: ["tabular-nums"],
      fontWeight: "800",
      letterSpacing: -0.8,
      lineHeight: 35,
    },
    summaryLabel: { color: c.primaryText, fontSize: 11, fontWeight: "600" },
    summaryRule: {
      backgroundColor: c.primaryBorderHover,
      height: 32,
      marginHorizontal: spacing.sm,
      width: 1,
    },
    summaryCopy: { flex: 1 },
    summaryTitle: { color: c.primaryText, fontSize: 15, fontWeight: "800" },
    summaryDetail: {
      color: c.accent,
      fontSize: 13,
      fontWeight: "600",
      marginTop: 2,
    },
    athleteRow: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
    meRow: { backgroundColor: c.primaryBg },
    rowPressed: { backgroundColor: c.bgHover },
    rowDivider: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    athleteHead: { alignItems: "center", flexDirection: "row" },
    avatar: {
      alignItems: "center",
      backgroundColor: c.primaryBgHover,
      borderRadius: 16,
      height: 32,
      justifyContent: "center",
      marginRight: spacing.sm,
      width: 32,
    },
    avatarText: { color: c.primaryText, fontSize: 12, fontWeight: "800" },
    athleteContent: { flex: 1, minWidth: 0 },
    nameLine: { alignItems: "center", flexDirection: "row", gap: 6 },
    athleteName: {
      color: c.text,
      flexShrink: 1,
      fontSize: 16,
      fontWeight: "700",
    },
    athleteMeta: { color: c.textSecondary, fontSize: 12, marginTop: 1 },
    youPill: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 6,
    },
    youPillText: {
      color: c.primaryContrast,
      fontSize: 11,
      fontWeight: "700",
      lineHeight: 16,
    },
    chevron: {
      color: c.textTertiary,
      fontSize: 25,
      fontWeight: "300",
      marginLeft: spacing.xs,
    },
    cutLines: { gap: 2, marginLeft: 32 + spacing.sm, marginTop: spacing.xs },
    cutLine: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "space-between",
    },
    cutEvent: {
      color: c.textSecondary,
      flexShrink: 1,
      fontSize: 14,
      fontWeight: "600",
    },
    cutTimeText: {
      color: c.text,
      fontSize: 14,
      fontVariant: ["tabular-nums"],
      fontWeight: "700",
    },
    cutMargin: { color: c.successText, fontSize: 12, fontWeight: "600" },
    group: { marginBottom: spacing.md },
    groupTitle: {
      color: c.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    standardHead: {
      backgroundColor: c.fillSecondary,
      minHeight: 0,
      paddingVertical: 6,
    },
    standardRow: {
      alignItems: "center",
      flexDirection: "row",
      minHeight: 44,
      paddingHorizontal: spacing.xs,
    },
    columnLabel: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      textAlign: "center",
    },
    sideCell: { flex: 1, textAlign: "center" },
    eventCell: { flex: 1.3, textAlign: "center" },
    standardEvent: { color: c.text, fontSize: 15, fontWeight: "600" },
    cutTime: {
      color: c.text,
      fontSize: 15,
      fontVariant: ["tabular-nums"],
      fontWeight: "600",
    },
    blankCut: { color: c.textTertiary, fontSize: 15 },
    galleryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -spacing.xxs,
      marginBottom: spacing.lg,
    },
    galleryItem: { width: "50%" },
  })
}

import { useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { athletePreferredName, formatTime } from "@swimbuzz/shared"
import { EmptyState, ErrorBlock, LoadingBlock, Muted, Screen, ScrollView, TextField, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { GalleryTile } from "../../../src/components/GalleryTile"
import { useViewPreferences } from "../../../src/lib/view-preferences"

type CutRow = {
  id?: string
  event?: string
  gender?: string
  timeMs?: number
  note?: string | null
}

type QualifierAthlete = {
  athleteId: string
  athleteSlug?: string | null
  firstName: string
  lastName: string
  nicknames?: string[]
  gender: string
  events: Array<{
    event: string
    time?: string
    timeMs?: number
    cut?: string
    meetName?: string
  }>
}

const COURSES = ["SCY", "LCM"] as const

function genderLabel(gender: unknown) {
  if (gender === "F") return "Women"
  if (gender === "M") return "Men"
  return gender ? String(gender) : "Open"
}

function genderSortKey(gender: unknown) {
  if (gender === "F") return 0
  if (gender === "M") return 1
  return 2
}

function athleteInitials(athlete: QualifierAthlete) {
  return `${athlete.firstName?.[0] ?? ""}${athlete.lastName?.[0] ?? ""}`.toUpperCase()
}

function eventTime(event: QualifierAthlete["events"][number]) {
  const time = event.time ?? (typeof event.timeMs === "number" ? formatTime(event.timeMs) : "")
  return `${event.event}${time ? ` · ${time}` : ""}`
}

export default function NationalsScreen() {
  const router = useRouter()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const styles = useMemo(() => makeStyles(c), [c])
  const { defaultView } = useViewPreferences()
  const gallery = defaultView === "gallery"
  const [seasonState, setSeasonState] = useState<string | null>(null)
  const [course, setCourse] = useState<(typeof COURSES)[number]>("SCY")
  const [query, setQuery] = useState("")

  const { data: seasons = [] } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.listSeasons(),
  })
  const season = seasonState ?? seasons[0] ?? null

  const {
    data: qualifiersData,
    isPending,
    error,
  } = useQuery({
    queryKey: ["qualifiers", season, course],
    queryFn: () => api.getQualifiers({ season: season as string, course }),
    enabled: Boolean(season),
  })
  // Only a genuinely new (season, course) pair shows a spinner — TanStack
  // Query serves cached data for a previously-visited pair instantly.
  const loading = Boolean(season) && isPending

  const cuts = useMemo<CutRow[]>(() => {
    const set = qualifiersData?.set
    return set && typeof set === "object" && Array.isArray((set as { cuts?: unknown }).cuts)
      ? ((set as { cuts: CutRow[] }).cuts ?? [])
      : []
  }, [qualifiersData])

  const qualifiers = useMemo<QualifierAthlete[]>(
    () =>
      Array.isArray(qualifiersData?.qualifiers)
        ? (qualifiersData.qualifiers as QualifierAthlete[])
        : [],
    [qualifiersData]
  )

  const filteredQualifiers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return qualifiers
    return qualifiers.filter((athlete) => {
      const name = `${athlete.firstName} ${athlete.lastName}`.toLowerCase()
      const nick = (athlete.nicknames ?? []).join(" ").toLowerCase()
      return name.includes(q) || nick.includes(q)
    })
  }, [qualifiers, query])

  const cutsByGender = useMemo(() => {
    const groups = new Map<string, CutRow[]>()
    for (const cut of cuts) {
      const key = String(cut.gender ?? "")
      const list = groups.get(key) ?? []
      list.push(cut)
      groups.set(key, list)
    }
    return [...groups.entries()].sort(([a], [b]) => genderSortKey(a) - genderSortKey(b))
  }, [cuts])

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>CHAMPIONSHIP STANDARDS</Text>
          <Text style={styles.description}>
            Track qualifying standards and athletes who have earned their place.
          </Text>
        </View>

        {error ? (
          <ErrorBlock message={error instanceof Error ? error.message : "Failed to load qualifiers"} />
        ) : null}

        <View style={styles.filtersCard}>
          <Text style={styles.filterLabel}>SEASON</Text>
          {seasons.length === 0 && !loading ? (
            <Muted>No seasons available.</Muted>
          ) : (
            <ScrollView
              horizontal
              contentContainerStyle={styles.seasonRow}
              showsHorizontalScrollIndicator={false}
            >
              {seasons.map((label) => {
                const selected = season === label
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSeasonState(label)}
                    style={({ pressed }) => [
                      styles.seasonPill,
                      selected && styles.seasonPillSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.seasonText, selected && styles.seasonTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}

          <View style={styles.divider} />
          <Text style={styles.filterLabel}>COURSE</Text>
          <View style={styles.courseControl}>
            {COURSES.map((value) => {
              const selected = course === value
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setCourse(value)}
                  style={({ pressed }) => [
                    styles.courseOption,
                    selected && styles.courseOptionSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.courseText, selected && styles.courseTextSelected]}>
                    {value}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <LoadingBlock />
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View>
                <Text style={styles.summaryNumber}>{qualifiers.length}</Text>
                <Text style={styles.summaryLabel}>
                  {qualifiers.length === 1 ? "qualified athlete" : "qualified athletes"}
                </Text>
              </View>
              <View style={styles.summaryRule} />
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>{season ?? "Current season"}</Text>
                <Text style={styles.summaryDetail}>{course} qualifying cuts</Text>
              </View>
            </View>

            <TextField
              label="Search"
              placeholder="Search qualifiers by name"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Qualified athletes</Text>
                <Text style={styles.sectionCaption}>Tap an athlete to view their profile.</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{filteredQualifiers.length}</Text>
              </View>
            </View>

            {filteredQualifiers.length === 0 ? (
              <EmptyState
                title={qualifiers.length === 0 ? "No qualifiers yet" : "No matching qualifiers"}
                body={
                  qualifiers.length === 0
                    ? "No athletes have made an NQT cut for this season and course."
                    : undefined
                }
              />
            ) : gallery ? (
              <View style={styles.galleryGrid}>
                {filteredQualifiers.map((athlete) => {
                  const name = athletePreferredName({
                    firstName: athlete.firstName,
                    lastName: athlete.lastName,
                    nicknames: athlete.nicknames ?? [],
                  })
                  const visibleEvents = athlete.events.slice(0, 2)
                  const hiddenEventCount = athlete.events.length - visibleEvents.length
                  const subtitle = [
                    ...visibleEvents.map(eventTime),
                    hiddenEventCount > 0 ? `+${hiddenEventCount} more` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                  return (
                    <View key={athlete.athleteId} style={styles.galleryItem}>
                      <GalleryTile
                        title={name}
                        subtitle={subtitle}
                        onPress={() =>
                          router.push(`/roster/${athlete.athleteSlug || athlete.athleteId}`)
                        }
                      />
                    </View>
                  )
                })}
              </View>
            ) : (
              <View style={styles.listCard}>
                {filteredQualifiers.map((athlete, index) => {
                  const name = athletePreferredName({
                    firstName: athlete.firstName,
                    lastName: athlete.lastName,
                    nicknames: athlete.nicknames ?? [],
                  })
                  const visibleEvents = athlete.events.slice(0, 2)
                  const hiddenEventCount = athlete.events.length - visibleEvents.length
                  return (
                    <Pressable
                      key={athlete.athleteId}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${name}'s profile`}
                      onPress={() => router.push(`/roster/${athlete.athleteSlug || athlete.athleteId}`)}
                      style={({ pressed }) => [
                        styles.athleteRow,
                        index < filteredQualifiers.length - 1 && styles.listDivider,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{athleteInitials(athlete)}</Text>
                      </View>
                      <View style={styles.athleteContent}>
                        <Text numberOfLines={1} style={styles.athleteName}>{name}</Text>
                        <View style={styles.eventLine}>
                          {visibleEvents.map((event, eventIndex) => (
                            <Text key={`${event.event}-${eventIndex}`} numberOfLines={1} style={styles.eventText}>
                              {eventTime(event)}
                            </Text>
                          ))}
                          {hiddenEventCount > 0 ? (
                            <Text style={styles.moreEvents}>+{hiddenEventCount} more</Text>
                          ) : null}
                        </View>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  )
                })}
              </View>
            )}

            <View style={styles.standardsHeader}>
              <Text style={styles.sectionTitle}>Qualifying standards</Text>
              <Text style={styles.sectionCaption}>
                {cuts.length} {cuts.length === 1 ? "event" : "events"} in this course
              </Text>
            </View>

            {cuts.length === 0 ? (
              <EmptyState
                title="No standards yet"
                body={season ? `No ${course} cuts found for ${season}.` : "Pick a season to view cuts."}
              />
            ) : (
              cutsByGender.map(([gender, rows]) => (
                <View key={gender || "open"} style={styles.standardsGroup}>
                  <View style={styles.standardsGroupHeader}>
                    <Text style={styles.standardsGroupTitle}>{genderLabel(gender)}</Text>
                    <Text style={styles.standardsGroupCount}>{rows.length} events</Text>
                  </View>
                  <View style={styles.standardsList}>
                    {rows.map((cut, index) => (
                      <View
                        key={cut.id ?? `${cut.event}-${cut.gender}-${index}`}
                        style={[styles.standardRow, index < rows.length - 1 && styles.listDivider]}
                      >
                        <View style={styles.standardEvent}>
                          <Text style={styles.standardName}>{cut.event ?? "Event"}</Text>
                          {cut.note ? <Text style={styles.standardNote}>{cut.note}</Text> : null}
                        </View>
                        <Text style={styles.standardTime}>
                          {typeof cut.timeMs === "number" ? formatTime(cut.timeMs) : "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
  screen: { paddingBottom: 0 },
  content: {},
  intro: { marginBottom: spacing.md },
  eyebrow: {
    color: c.primaryActive,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: spacing.xxs,
  },
  description: {
    color: c.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xxs,
    maxWidth: 330,
  },
  filtersCard: {
    backgroundColor: c.bgContainer,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: "hidden",
    padding: spacing.sm,
  },
  filterLabel: {
    color: c.textTertiary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  seasonRow: { gap: spacing.xs, paddingRight: spacing.sm },
  seasonPill: {
    backgroundColor: c.fillSecondary,
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  seasonPillSelected: { backgroundColor: c.primaryBg, borderColor: c.primaryActive },
  seasonText: { color: c.textSecondary, fontSize: 14, fontWeight: "600" },
  seasonTextSelected: { color: c.primaryText, fontWeight: "800" },
  divider: {
    backgroundColor: c.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  courseControl: {
    backgroundColor: c.fillSecondary,
    borderRadius: radii.md,
    flexDirection: "row",
    padding: 3,
  },
  courseOption: {
    alignItems: "center",
    borderRadius: radii.sm,
    flex: 1,
    paddingVertical: 7,
  },
  courseOptionSelected: {
    backgroundColor: c.bgContainer,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  courseText: { color: c.textSecondary, fontSize: 14, fontWeight: "700" },
  courseTextSelected: { color: c.text },
  pressed: { opacity: 0.72 },
  loadingCard: {
    backgroundColor: c.bgContainer,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  summaryCard: {
    alignItems: "center",
    backgroundColor: c.primaryBg,
    borderColor: c.primaryBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: spacing.lg,
    padding: spacing.sm,
  },
  summaryNumber: {
    color: c.primaryText,
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 35,
  },
  summaryLabel: { color: c.primaryText, fontSize: 11, fontWeight: "600" },
  summaryRule: { backgroundColor: c.primaryBorderHover, height: 32, marginHorizontal: spacing.sm, width: 1 },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: c.primaryText, fontSize: 15, fontWeight: "800" },
  summaryDetail: { color: c.primaryActive, fontSize: 13, fontWeight: "600", marginTop: 2 },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: c.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  sectionCaption: { color: c.textSecondary, fontSize: 12, marginTop: 2 },
  countBadge: {
    alignItems: "center",
    backgroundColor: c.fillSecondary,
    borderRadius: 999,
    justifyContent: "center",
    minWidth: 28,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  countBadgeText: { color: c.textSecondary, fontSize: 12, fontWeight: "800" },
  listCard: {
    backgroundColor: c.bgContainer,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  athleteRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowPressed: { backgroundColor: c.fillSecondary },
  listDivider: { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
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
  athleteName: { color: c.text, fontSize: 16, fontWeight: "700" },
  eventLine: { flexDirection: "row", flexWrap: "wrap", gap: 2, marginTop: 4 },
  eventText: { color: c.textSecondary, fontSize: 12, lineHeight: 17, maxWidth: "100%" },
  moreEvents: { color: c.primaryActive, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  chevron: {
    color: c.textTertiary,
    fontSize: 25,
    fontWeight: "300",
    marginLeft: spacing.xs,
  },
  standardsHeader: { marginBottom: spacing.sm },
  standardsGroup: { marginBottom: spacing.sm },
  standardsGroupHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  standardsGroupTitle: { color: c.text, fontSize: 15, fontWeight: "800" },
  standardsGroupCount: { color: c.textTertiary, fontSize: 12, fontWeight: "600" },
  standardsList: {
    backgroundColor: c.bgContainer,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  standardRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 50,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  standardEvent: { flex: 1, paddingRight: spacing.sm },
  standardName: { color: c.text, fontSize: 15, fontWeight: "700" },
  standardNote: { color: c.textSecondary, fontSize: 12, marginTop: 2 },
  standardTime: {
    color: c.primaryActive,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.xxs,
    marginBottom: spacing.lg,
  },
  galleryItem: { width: "50%" },
  })
}

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AccessibilityInfo,
  Pressable,
  ScrollView as RNScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
import {
  formatPoints,
  paginateHighlights,
  TEAM_SCORE_SECTIONS,
  teamPlaceLabel,
  type MeetHighlights,
  type StatCounter,
  type TeamScores,
  type TeamScoresSection,
} from "@swimbuzz/shared"
import { BottomSheet, Chip, Muted, Section, SectionHeader, usePalette } from "@swimbuzz/ui"
import { radii, spacing } from "@swimbuzz/tokens"

const AUTOPLAY_MS = 6000
const TILE_GAP = spacing.xs

function isDropValue(value: string | number) {
  return typeof value === "string" && /^[-−]/.test(value)
}

function HighlightTile({ counter }: { counter: StatCounter }) {
  const c = usePalette()
  const isText = typeof counter.value === "string" && !/^[-−+]?[\d.:]+$/.test(counter.value)
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.bgContainer,
      }}
    >
      <Text
        numberOfLines={isText ? 2 : 1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{
          fontSize: isText ? 16 : 20,
          fontWeight: "600",
          textAlign: "center",
          fontVariant: ["tabular-nums"],
          color: isDropValue(counter.value) ? c.success : c.text,
        }}
      >
        {String(counter.value)}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 4,
          fontSize: 10,
          fontWeight: "500",
          letterSpacing: 0.25,
          textTransform: "uppercase",
          color: c.textTertiary,
        }}
      >
        {counter.label}
      </Text>
      {counter.hint ? (
        <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: c.textSecondary }}>
          {counter.hint}
        </Text>
      ) : null}
      {counter.detail ? (
        <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 11, color: c.textTertiary }}>
          {counter.detail}
        </Text>
      ) : null}
    </View>
  )
}

/** Every team's standing — women, men and combined — with our team's line in gold. */
function TeamScoresSheet({
  teamScores,
  section,
  onSectionChange,
  onClose,
}: {
  teamScores: TeamScores
  section: TeamScoresSection | null
  onSectionChange: (section: TeamScoresSection) => void
  onClose: () => void
}) {
  const c = usePalette()
  const { height } = useWindowDimensions()
  const sections = TEAM_SCORE_SECTIONS.filter((s) => teamScores[s.key].length > 0)
  const standings = section ? teamScores[section] : []
  return (
    <BottomSheet visible={section != null} onClose={onClose} title="Team Scores">
      {teamScores.source === "computed" ? (
        <Muted style={{ marginBottom: spacing.sm }}>Added up from the points in the results.</Muted>
      ) : null}
      {sections.length > 1 ? (
        <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm }}>
          {sections.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              selected={section === s.key}
              onPress={() => onSectionChange(s.key)}
            />
          ))}
        </View>
      ) : null}
      <RNScrollView style={{ maxHeight: height * 0.55 }}>
        {standings.map((standing, i) => (
          <View
            key={`${standing.place}-${standing.team}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              paddingVertical: spacing.xs,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.borderSecondary,
            }}
          >
            <Text
              style={{
                width: 44,
                textAlign: "right",
                fontSize: 12,
                fontVariant: ["tabular-nums"],
                color: standing.ours ? c.accent : c.textTertiary,
              }}
            >
              {teamPlaceLabel(standing, standings)}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: standing.ours ? "600" : "400",
                color: standing.ours ? c.accent : c.text,
              }}
            >
              {standing.team}
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: standing.ours ? "600" : "400",
                fontVariant: ["tabular-nums"],
                color: standing.ours ? c.accent : c.text,
              }}
            >
              {formatPoints(standing.points)}
            </Text>
          </View>
        ))}
      </RNScrollView>
    </BottomSheet>
  )
}

/**
 * The meet's highlights, a page at a time like the web's: team scores (tap for every team's
 * standing), top scorers, then result stats. Swipe between pages; they also advance on their own.
 */
export function MeetHighlightsCarousel({ highlights }: { highlights: MeetHighlights }) {
  const c = usePalette()
  const pages = paginateHighlights(highlights.counters)
  const teamScores = highlights.teamScores ?? null
  const scrollRef = useRef<RNScrollView>(null)
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [scoresSection, setScoresSection] = useState<TeamScoresSection | null>(null)
  const pausedRef = useRef(false)
  const pageCount = pages.length

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => mounted && setReduced(on))
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced)
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  const go = useCallback(
    (next: number) => {
      if (!width || pageCount === 0) return
      const target = (next + pageCount) % pageCount
      scrollRef.current?.scrollTo({ x: target * width, animated: !reduced })
      setIndex(target)
    },
    [width, pageCount, reduced]
  )

  useEffect(() => {
    if (pageCount <= 1 || !width) return
    const timer = setInterval(() => {
      if (!pausedRef.current) go(index + 1)
    }, AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [go, index, pageCount, width])

  if (pageCount === 0) return null

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    pausedRef.current = false
    if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
  }

  const dots =
    pageCount > 1 ? (
      <View style={{ flexDirection: "row", gap: 5 }}>
        {pages.map((_, i) => (
          <Pressable
            key={i}
            onPress={() => go(i)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Show highlights ${i + 1} of ${pageCount}`}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? c.accent : c.fill,
              }}
            />
          </Pressable>
        ))}
      </View>
    ) : null

  return (
    <Section>
      <SectionHeader title="Highlights" right={dots} />
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <RNScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => (pausedRef.current = true)}
          onMomentumScrollEnd={onScrollEnd}
        >
          {width
            ? pages.map((page, i) => (
                <View
                  key={i}
                  accessibilityElementsHidden={i !== index}
                  importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}
                  style={{ width, flexDirection: "row", gap: TILE_GAP }}
                >
                  {page.counters.map((counter) => {
                    const section =
                      page.kind === "teamScores"
                        ? TEAM_SCORE_SECTIONS.find((s) => s.label === counter.label)?.key
                        : undefined
                    return teamScores && section ? (
                      <Pressable
                        key={counter.label}
                        onPress={() => setScoresSection(section)}
                        accessibilityRole="button"
                        accessibilityLabel={`${counter.label} team scores: ${counter.value}, ${counter.hint ?? ""}`}
                        style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.7 : 1 })}
                      >
                        <HighlightTile counter={counter} />
                      </Pressable>
                    ) : (
                      <HighlightTile key={counter.label} counter={counter} />
                    )
                  })}
                </View>
              ))
            : null}
        </RNScrollView>
      </View>
      {teamScores ? (
        <TeamScoresSheet
          teamScores={teamScores}
          section={scoresSection}
          onSectionChange={setScoresSection}
          onClose={() => setScoresSection(null)}
        />
      ) : null}
    </Section>
  )
}

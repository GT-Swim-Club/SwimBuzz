import { useCallback, useEffect, useRef, useState } from "react"
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
import * as Sharing from "expo-sharing"
import {
  formatPoints,
  meetHighlightsExportRequest,
  paginateHighlights,
  TEAM_SCORE_SECTIONS,
  teamPlaceLabel,
  type MeetHeaderDetails,
  type MeetHighlights,
  type RosterSummaryPdfRequest,
  type StatCounter,
  type TeamScores,
  type TeamScoresSection,
} from "@swimbuzz/shared"
import {
  ActionSheet,
  BottomSheet,
  Chip,
  Muted,
  Section,
  SectionHeader,
  usePalette,
  type ActionSheetItem,
} from "@swimbuzz/ui"
import { radii, spacing } from "@swimbuzz/tokens"
import { rosterSummaryPdfFile, saveCaptureToPhotos } from "../lib/roster-summary-share"
import { Icon } from "./Icon"
import { RosterSummaryExportCapture } from "./RosterSummaryExportCapture"

const AUTOPLAY_MS = 6000
const TILE_GAP = spacing.xs

function isDropValue(value: string | number) {
  return typeof value === "string" && /^[-−]/.test(value)
}

/** One highlight: its value (a drop in green), caps label, hint and detail. Also drawn in the Results PNG. */
export function HighlightTile({ counter }: { counter: StatCounter }) {
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
        // Room for names tied for a highlight ("Ann Lee, Bo Kim & Cy Diaz").
        numberOfLines={isText ? 3 : 1}
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
 * The highlights card's share sheet, like the roster summary's: Save to Photos (the one-page
 * highlights image) and Share PDF (the same page, laid out by the API).
 */
function useHighlightsShare(meetId: string, meetName: string, highlights: MeetHighlights) {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState<"photos" | "pdf" | null>(null)
  const [saved, setSaved] = useState(false)
  // The highlights as of opening the sheet, rendered off-screen for the PNG while it's open.
  const [request, setRequest] = useState<RosterSummaryPdfRequest | null>(null)
  const captureRef = useRef<View>(null)
  const dismissRef = useRef<(() => void) | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    }
  }, [])

  function open() {
    setRequest(meetHighlightsExportRequest(highlights))
    setSaved(false)
    setVisible(true)
  }

  /**
   * Closes the sheet and waits for it to finish dismissing — iOS won't present another native
   * sheet over a modal that's still animating closed (same as the roster summary).
   */
  function closeAndWait(): Promise<void> {
    setVisible(false)
    if (Platform.OS !== "ios") return Promise.resolve()
    return new Promise((resolve) => {
      const finish = () => {
        dismissRef.current = null
        clearTimeout(fallback)
        resolve()
      }
      const fallback = setTimeout(finish, 600)
      dismissRef.current = finish
    })
  }

  async function saveToPhotos() {
    if (!captureRef.current) return
    setBusy("photos")
    try {
      if (!(await saveCaptureToPhotos(captureRef))) {
        Alert.alert("Permission needed", "Allow photo access in Settings to save highlights images.")
        return
      }
      setSaved(true)
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      Alert.alert("Could not save image", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  async function sharePdf() {
    setBusy("pdf")
    try {
      const file = await rosterSummaryPdfFile(meetId, meetName, request ?? meetHighlightsExportRequest(highlights))
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't open the share sheet.")
        return
      }
      await closeAndWait()
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
    } catch (err) {
      Alert.alert("Could not share PDF", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  return {
    visible,
    busy,
    saved,
    request,
    captureRef,
    open,
    close: () => setVisible(false),
    onDismiss: () => dismissRef.current?.(),
    saveToPhotos,
    sharePdf,
  }
}

/**
 * The meet's highlights, a page at a time like the web's: team scores (tap for every team's
 * standing), top scorers, then result stats. Swipe between pages; they also advance on their own.
 */
export function MeetHighlightsCarousel({
  highlights,
  meetId,
  meetName,
  details,
  iconUrl,
}: {
  highlights: MeetHighlights
  /** The meet, for the one-page highlights export (Save to Photos, Share PDF). */
  meetId: string
  meetName: string
  details: MeetHeaderDetails
  iconUrl: string | null
}) {
  const c = usePalette()
  const share = useHighlightsShare(meetId, meetName, highlights)
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
      <SectionHeader
        title="Highlights"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            {dots}
            <Pressable
              onPress={share.open}
              disabled={Boolean(share.busy)}
              accessibilityRole="button"
              accessibilityLabel="Share highlights"
              hitSlop={8}
              style={{ paddingVertical: spacing.xxs, paddingHorizontal: spacing.xs }}
            >
              {share.busy ? (
                <ActivityIndicator size="small" color={c.text} />
              ) : (
                <Icon name="share" size={20} color={c.text} />
              )}
            </Pressable>
          </View>
        }
      />
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
      <ActionSheet
        visible={share.visible}
        onClose={share.close}
        onDismiss={share.onDismiss}
        title="Share highlights"
        groups={[
          [
            {
              key: "photos",
              label: share.saved ? "Saved to Photos" : "Save to Photos",
              icon: <Icon name={share.saved ? "check" : "image"} size={20} color={c.text} />,
              busy: share.busy === "photos",
              disabled: Boolean(share.busy) && share.busy !== "photos",
              onPress: () => void share.saveToPhotos(),
            },
            {
              key: "pdf",
              label: "Share PDF",
              icon: <Icon name="fileText" size={20} color={c.text} />,
              busy: share.busy === "pdf",
              disabled: Boolean(share.busy) && share.busy !== "pdf",
              onPress: () => void share.sharePdf(),
            },
          ] satisfies ActionSheetItem[],
        ]}
      />
      {/* Off-screen mirror captured to PNG while the share sheet is open — never shown in the layout. */}
      {share.visible && share.request ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: -10000 }}>
          <RosterSummaryExportCapture
            ref={share.captureRef}
            meetName={meetName}
            details={details}
            iconUrl={iconUrl}
            request={share.request}
          />
        </View>
      ) : null}
    </Section>
  )
}

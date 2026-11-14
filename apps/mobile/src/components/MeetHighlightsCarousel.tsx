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
  formatOrdinal,
  formatPoints,
  highlightCounterList,
  highlightLists,
  isDropCounterValue,
  meetHighlightsExportRequest,
  paginateHighlights,
  TEAM_SCORE_SECTIONS,
  teamPlaceLabel,
  type HighlightList,
  type HighlightListKey,
  type MeetHeaderDetails,
  type MeetHighlights,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfResult,
  type RosterSummaryPdfRow,
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
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { rosterSummaryPdfFile, saveCaptureToPhotos } from "../lib/roster-summary-share"
import { Icon } from "./Icon"
import { RosterSummaryExportCapture } from "./RosterSummaryExportCapture"

const AUTOPLAY_MS = 6000
const TILE_GAP = spacing.xs

function isDropValue(value: string | number) {
  return typeof value === "string" && /^[-−]/.test(value)
}

/** A 1st / 2nd / 3rd place's medal color; nothing past 3rd. */
function medalColor(c: ColorPalette, place: number | undefined): string | null {
  if (place === 1) return c.medalGold
  if (place === 2) return c.medalSilver
  if (place === 3) return c.medalBronze
  return null
}

/**
 * One highlight: its value (a drop in green), caps label, hint and detail. Also drawn in the Results
 * PNG, which passes `hintBesideLabel` to set a counter's hint after its label ("BUSIEST · 12 races").
 * The carousel passes `medalPlaces` to color a team score's 1st–3rd place gold, silver or bronze.
 */
export function HighlightTile({
  counter,
  hintBesideLabel = false,
  medalPlaces = false,
}: {
  counter: StatCounter
  hintBesideLabel?: boolean
  medalPlaces?: boolean
}) {
  const c = usePalette()
  const medal = medalPlaces ? medalColor(c, counter.place) : null
  const besideLabel = hintBesideLabel && counter.hintBesideLabel && counter.hint
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
          fontWeight: medal ? "700" : "600",
          textAlign: "center",
          fontVariant: ["tabular-nums"],
          color: medal ?? (isDropValue(counter.value) ? c.successText : c.text),
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
        {besideLabel ? (
          <Text style={{ fontSize: 12, fontWeight: "400", letterSpacing: 0, textTransform: "none", color: c.textSecondary }}>
            {` · ${counter.hint}`}
          </Text>
        ) : null}
      </Text>
      {counter.hint && !besideLabel ? (
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

function ListResult({ result }: { result: RosterSummaryPdfResult }) {
  const c = usePalette()
  if (result.kind === "text") {
    return (
      <Text
        style={{
          fontSize: 15,
          fontWeight: result.strong ? "600" : "400",
          fontVariant: ["tabular-nums"],
          color: result.strong ? c.text : c.textSecondary,
        }}
      >
        {result.text}
      </Text>
    )
  }
  if (result.kind !== "done") return null
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.xs }}>
      {result.delta ? (
        <Text
          style={{
            fontSize: 12,
            fontVariant: ["tabular-nums"],
            color: isDropCounterValue(result.delta) ? c.successText : c.textTertiary,
          }}
        >
          {result.delta}
        </Text>
      ) : null}
      <Text style={{ fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"], color: c.text }}>
        {result.time ?? result.status ?? "—"}
      </Text>
    </View>
  )
}

function ListRow({ row, first }: { row: RosterSummaryPdfRow; first: boolean }) {
  const c = usePalette()
  if (row.subheading) {
    return (
      <Text
        style={{
          paddingTop: first ? 0 : spacing.sm,
          paddingBottom: spacing.xxs,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: c.accent,
        }}
      >
        {row.label}
      </Text>
    )
  }
  const medal = medalColor(c, row.place)
  const lead = row.place != null ? formatOrdinal(row.place) : row.eventNumber != null ? String(row.eventNumber) : null
  const secondary = { fontSize: 12, color: c.textSecondary } as const
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
        paddingVertical: spacing.xs,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.borderSecondary,
      }}
    >
      {lead ? (
        <Text
          style={{
            width: 32,
            paddingTop: 2,
            fontSize: 12,
            fontWeight: medal ? "700" : "400",
            fontVariant: ["tabular-nums"],
            color: medal ?? c.textTertiary,
          }}
        >
          {lead}
        </Text>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "500", color: c.text }}>
          {row.label}
        </Text>
        {row.meta ? <Text style={secondary}>{row.meta}</Text> : null}
        {row.legs?.length ? <Text style={secondary}>{row.legs.join(" · ")}</Text> : null}
        {row.cuts?.map((cut) => (
          <View key={cut.event} style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: 2 }}>
            <Text numberOfLines={1} style={[secondary, { flex: 1 }]}>
              {cut.event}
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontVariant: ["tabular-nums"],
                color: isDropCounterValue(cut.delta) ? c.successText : c.textTertiary,
              }}
            >
              {cut.delta}
            </Text>
            <Text style={{ fontSize: 12, fontVariant: ["tabular-nums"], color: c.text }}>
              {cut.time} <Text style={{ color: c.textTertiary }}>/ {cut.cut}</Text>
            </Text>
          </View>
        ))}
      </View>
      {row.result ? <ListResult result={row.result} /> : null}
    </View>
  )
}

/**
 * A highlight tile's list — top scorers, top performances, GTSC records or new Nationals cuts — the
 * same rows the highlights export draws, a chip for each list there is.
 */
function HighlightListsSheet({
  lists,
  list,
  visible,
  onListChange,
  onClose,
}: {
  lists: HighlightList[]
  /** The list shown — kept while the sheet slides closed. */
  list: HighlightListKey | null
  visible: boolean
  onListChange: (list: HighlightListKey) => void
  onClose: () => void
}) {
  const { height } = useWindowDimensions()
  const shown = lists.find((l) => l.key === list) ?? lists[0]
  return (
    <BottomSheet visible={visible} onClose={onClose} title={shown?.title}>
      {lists.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm }}>
          {lists.map((l) => (
            <Chip key={l.key} label={l.tab} selected={shown?.key === l.key} onPress={() => onListChange(l.key)} />
          ))}
        </View>
      ) : null}
      <RNScrollView style={{ maxHeight: height * 0.55 }}>
        {(shown?.rows ?? []).map((row, i) => (
          <ListRow key={`${i}-${row.label}`} row={row} first={i === 0} />
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
 * standing), top scorers, then result stats (top scorers, wins, podiums, GTSC records and new cuts
 * open their lists). Swipe between pages; they advance on their own until someone swipes, taps or
 * shares, and never while a sheet is open.
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
  const lists = highlightLists(highlights)
  const scrollRef = useRef<RNScrollView>(null)
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [scoresSection, setScoresSection] = useState<TeamScoresSection | null>(null)
  const [openList, setOpenList] = useState<HighlightListKey | null>(null)
  const [listVisible, setListVisible] = useState(false)
  // Any swipe, dot, tile tap or share stops autoplay for good.
  const [stopped, setStopped] = useState(false)
  const pageCount = pages.length
  const paused = stopped || scoresSection != null || listVisible || share.visible

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
    if (pageCount <= 1 || !width || paused) return
    const timer = setInterval(() => go(index + 1), AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [go, index, pageCount, width, paused])

  if (pageCount === 0) return null

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
  }

  const dots =
    pageCount > 1 ? (
      <View style={{ flexDirection: "row", gap: 5 }}>
        {pages.map((_, i) => (
          <Pressable
            key={i}
            onPress={() => {
              setStopped(true)
              go(i)
            }}
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
              onPress={() => {
                setStopped(true)
                share.open()
              }}
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
          onScrollBeginDrag={() => setStopped(true)}
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
                    const listKey = highlightCounterList(counter)
                    const list = listKey ? lists.find((l) => l.key === listKey) : undefined
                    const open =
                      teamScores && section
                        ? {
                            label: `${counter.label} team scores: ${counter.value}, ${counter.hint ?? ""}`,
                            run: () => setScoresSection(section),
                          }
                        : list
                          ? {
                              label: `${counter.label}: ${counter.value}. Show ${list.title}`,
                              run: () => {
                                setOpenList(list.key)
                                setListVisible(true)
                              },
                            }
                          : null
                    return open ? (
                      <Pressable
                        key={counter.label}
                        onPress={() => {
                          setStopped(true)
                          open.run()
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={open.label}
                        style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.7 : 1 })}
                      >
                        <HighlightTile counter={counter} medalPlaces />
                      </Pressable>
                    ) : (
                      <HighlightTile key={counter.label} counter={counter} medalPlaces />
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
      {lists.length > 0 ? (
        <HighlightListsSheet
          lists={lists}
          list={openList}
          visible={listVisible}
          onListChange={setOpenList}
          onClose={() => setListVisible(false)}
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

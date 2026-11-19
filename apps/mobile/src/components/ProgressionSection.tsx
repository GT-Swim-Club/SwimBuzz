import { useMemo, useState } from "react"
import {
  Pressable,
  ScrollView as HScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from "react-native"
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg"
import {
  PROGRESSION_WINDOW_MS,
  formatMonthYear,
  formatProgressionAxisTime,
  formatTime,
  progressionBests,
  progressionDotRadius,
  progressionTimeAxis,
  progressionWindowed,
  progressionYearTicks,
} from "@swimbuzz/shared"
import { Chip, Muted, Section, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"

/** A swim or relay split as the athlete payload carries it (`relayEvent` set on a split). */
export type ProgressionSwimRow = {
  id?: string
  event?: string
  course?: string
  timeMs?: number
  date?: string
  meet?: string
  meetRef?: { name?: string } | null
  relayEvent?: string
  leg?: number | null
}

type Swim = {
  id: string
  event: string
  course: string
  timeMs: number
  date: string
  meet: string
  relayEvent: string | null
  leg: number | null
}

type Point = { swim: Swim; x: number; y: number; overlay: boolean }

const COURSE_ORDER = ["SCY", "LCM", "SCM"]
const STROKE_ORDER = ["Free", "Back", "Breast", "Fly", "IM"]
const PLOT_H = 180
const PAD_TOP = 24
const PAD_BOTTOM = 8
const PAD_X = 10
const Y_AXIS_W = 46
const X_AXIS_H = 20
const YEAR_LABEL_GAP = 40
const END_LABEL_W = 58

function toSwim(row: ProgressionSwimRow, index: number): Swim | null {
  if (!row.event || !row.course || typeof row.timeMs !== "number" || !row.date) return null
  if (Number.isNaN(Date.parse(row.date))) return null
  return {
    id: row.id ?? `${index}-${row.event}-${row.timeMs}`,
    event: row.event,
    course: row.course,
    timeMs: row.timeMs,
    date: row.date,
    meet: row.meetRef?.name || row.meet || "",
    relayEvent: row.relayEvent ?? null,
    leg: row.leg ?? null,
  }
}

/** Oldest first; on the same day the slower swim first, so a prelims → finals drop reads as a best. */
function chronological(a: Swim, b: Swim): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return b.timeMs - a.timeMs
}

/** Stroke order, then distance: "50 Free", "100 Free", …, "200 IM". */
function compareEvents(a: string, b: string): number {
  const [ad, ...as] = a.split(" ")
  const [bd, ...bs] = b.split(" ")
  const ai = STROKE_ORDER.indexOf(as.join(" "))
  const bi = STROKE_ORDER.indexOf(bs.join(" "))
  if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  return Number(ad) - Number(bd) || a.localeCompare(b)
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatDelta(ms: number): string {
  const abs = Math.abs(ms)
  const text = abs >= 60_000 ? formatTime(abs) : (abs / 1000).toFixed(2)
  return `${ms < 0 ? "−" : "+"}${text}`
}

/**
 * Progression chart for one event + course, picked from chips: faster times plot higher,
 * dates to scale. Opens on the last 5 years; relay splits can be shown as hollow points.
 */
export function ProgressionSection({
  swims: swimRows,
  relaySplits: splitRows,
}: {
  swims: ProgressionSwimRow[]
  relaySplits: ProgressionSwimRow[]
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const swims = useMemo(
    () => swimRows.map(toSwim).filter((s): s is Swim => s != null).sort(chronological),
    [swimRows]
  )
  const splits = useMemo(
    () => splitRows.map(toSwim).filter((s): s is Swim => s != null).sort(chronological),
    [splitRows]
  )

  // Courses and events with flat-start swims; splits only add to an event that has them.
  const courses = useMemo(
    () => COURSE_ORDER.filter((course) => swims.some((s) => s.course === course)),
    [swims]
  )
  const [courseChoice, setCourseChoice] = useState<string | null>(null)
  const course = courseChoice && courses.includes(courseChoice) ? courseChoice : courses[0] ?? null

  const events = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of swims) if (s.course === course) counts.set(s.event, (counts.get(s.event) ?? 0) + 1)
    return counts
  }, [swims, course])
  const eventList = useMemo(() => [...events.keys()].sort(compareEvents), [events])
  const [eventChoice, setEventChoice] = useState<string | null>(null)
  // Default to the event swum most.
  const event =
    eventChoice && events.has(eventChoice)
      ? eventChoice
      : [...events.entries()].sort((a, b) => b[1] - a[1] || compareEvents(a[0], b[0]))[0]?.[0] ?? null

  const [windowStart] = useState(() => Date.now() - PROGRESSION_WINDOW_MS)
  const [showFullHistory, setShowFullHistory] = useState(false)
  const [showSplits, setShowSplits] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [width, setWidth] = useState(0)

  const sel = useMemo(() => swims.filter((s) => s.event === event && s.course === course), [swims, event, course])
  const selSplits = useMemo(
    () => splits.filter((s) => s.event === event && s.course === course),
    [splits, event, course]
  )
  const bests = useMemo(() => progressionBests(sel, (s) => s.meet || s.date.slice(0, 10)), [sel])

  if (!course || !event || sel.length === 0) return null

  const pb = sel.reduce((best, s) => (s.timeMs < best.timeMs ? s : best), sel[0]!)
  const windowed = progressionWindowed(sel, windowStart)
  const useWindow = windowed.hasOlder && !showFullHistory
  const plotted = useWindow ? windowed.plotted : sel
  const plottedSplits = showSplits
    ? useWindow
      ? selSplits.filter((s) => Date.parse(s.date) >= windowStart)
      : selSplits
    : []
  const all = [...plotted, ...plottedSplits]
  const dates = all.map((s) => Date.parse(s.date))
  const firstMs = Math.min(...dates)
  const lastMs = Math.max(...dates)
  const spanMs = lastMs - firstMs
  const axis = progressionTimeAxis(Math.min(...all.map((s) => s.timeMs)), Math.max(...all.map((s) => s.timeMs)))

  const plotW = Math.max(0, width - Y_AXIS_W)
  const xAt = (ms: number) =>
    Y_AXIS_W + (spanMs === 0 ? plotW / 2 : PAD_X + ((ms - firstMs) / spanMs) * (plotW - 2 * PAD_X))
  const yAt = (ms: number) => PAD_TOP + ((ms - axis.min) / (axis.max - axis.min)) * (PLOT_H - PAD_TOP - PAD_BOTTOM)
  const points: Point[] = plotted.map((s) => ({ swim: s, x: xAt(Date.parse(s.date)), y: yAt(s.timeMs), overlay: false }))
  const splitPoints: Point[] = plottedSplits.map((s) => ({
    swim: s,
    x: xAt(Date.parse(s.date)),
    y: yAt(s.timeMs),
    overlay: true,
  }))
  const r = progressionDotRadius(plotW - 2 * PAD_X, points.length + splitPoints.length)
  const selected = [...points, ...splitPoints].find((p) => p.swim.id === selectedId) ?? null
  const pbPoint = points.find((p) => p.swim.id === pb.id) ?? null

  const yearLines = progressionYearTicks(firstMs, lastMs).map((t) => ({ year: t.year, x: xAt(t.ms) }))
  const yearLabels: typeof yearLines = []
  for (const tick of yearLines) {
    const prev = yearLabels[yearLabels.length - 1]
    if (tick.x < Y_AXIS_W + END_LABEL_W || tick.x > width - END_LABEL_W) continue
    if (prev && tick.x - prev.x < YEAR_LABEL_GAP) continue
    yearLabels.push(tick)
  }

  const charted = sel.length > 1 || splitPoints.length > 0

  function onLayout(e: LayoutChangeEvent) {
    setWidth(Math.round(e.nativeEvent.layout.width))
  }

  function onPress(e: GestureResponderEvent) {
    const { locationX, locationY } = e.nativeEvent
    let best: Point | null = null
    let bestD = Infinity
    for (const p of [...points, ...splitPoints]) {
      const d = (p.x - locationX) ** 2 + (p.y - locationY) ** 2
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    setSelectedId(best && best.swim.id !== selectedId ? best.swim.id : null)
  }

  function pickCourse(next: string) {
    setCourseChoice(next)
    setEventChoice(null)
    setSelectedId(null)
    setShowFullHistory(false)
  }

  function pickEvent(next: string) {
    setEventChoice(next)
    setSelectedId(null)
    setShowFullHistory(false)
  }

  const improvement = selected && !selected.overlay ? bests.improvement.get(selected.swim.id) ?? null : null
  const noun = sel.length === 1 ? "swim" : "swims"

  return (
    <Section title="Progression">
      {courses.length > 1 ? (
        <View style={styles.chipRow}>
          {courses.map((option) => (
            <Chip key={option} label={option} selected={option === course} onPress={() => pickCourse(option)} />
          ))}
        </View>
      ) : null}
      {eventList.length > 1 ? (
        <HScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {eventList.map((option) => (
            <Chip key={option} label={option} selected={option === event} onPress={() => pickEvent(option)} />
          ))}
        </HScrollView>
      ) : null}

      <View style={styles.headerRow}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.eyebrow}>
            {event} · {course} · Personal best
          </Text>
          <Text style={styles.pbTime}>{formatTime(pb.timeMs)}</Text>
        </View>
        {selSplits.length > 0 ? (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Relay splits</Text>
            <Switch
              value={showSplits}
              onValueChange={(on) => {
                setShowSplits(on)
                setSelectedId(null)
              }}
              trackColor={{ false: c.switchTrack, true: c.primary }}
              thumbColor={c.switchThumb}
              accessibilityLabel="Show relay splits"
            />
          </View>
        ) : null}
      </View>

      {!charted ? (
        <View style={styles.single}>
          <Muted style={{ textAlign: "center" }}>One swim so far. The chart starts with the second.</Muted>
        </View>
      ) : (
        <>
          {showSplits ? (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <Svg width={18} height={10}>
                  <Line x1={1} y1={5} x2={17} y2={5} stroke={c.primary} strokeWidth={2} strokeLinecap="round" />
                  <Circle cx={9} cy={5} r={3} fill={c.textTertiary} stroke={c.bgContainer} strokeWidth={1.5} />
                </Svg>
                <Text style={styles.legendText}>Flat start</Text>
              </View>
              <View style={styles.legendItem}>
                <Svg width={10} height={10}>
                  <Circle cx={5} cy={5} r={3.5} fill={c.bgContainer} stroke={c.textSecondary} strokeWidth={1.5} />
                </Svg>
                <Text style={styles.legendText}>Relay split (flying start)</Text>
              </View>
            </View>
          ) : null}
          <Pressable
            onLayout={onLayout}
            onPress={onPress}
            style={{ height: PLOT_H + X_AXIS_H }}
            accessibilityRole="image"
            accessibilityLabel={`${event} ${course} progression: ${points.length} ${noun}${
              splitPoints.length ? ` and ${splitPoints.length} relay splits` : ""
            } from ${formatMonthYear(new Date(firstMs))} to ${formatMonthYear(new Date(lastMs))}. Personal best ${formatTime(pb.timeMs)}.`}
          >
            {width > 0 ? (
              // Not a touch target itself, so a press's location is relative to the Pressable.
              <View pointerEvents="none">
              <Svg width={width} height={PLOT_H + X_AXIS_H}>
                {axis.ticks.map((t, i) => (
                  <Line
                    key={`g${t}`}
                    x1={Y_AXIS_W}
                    x2={width}
                    y1={yAt(t)}
                    y2={yAt(t)}
                    stroke={i === axis.ticks.length - 1 ? c.border : c.borderSecondary}
                    strokeWidth={1}
                  />
                ))}
                {axis.ticks.map((t) => (
                  <SvgText
                    key={`l${t}`}
                    x={Y_AXIS_W - 8}
                    y={yAt(t) + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fill={c.textTertiary}
                  >
                    {formatProgressionAxisTime(t, axis.step)}
                  </SvgText>
                ))}
                {yearLines.map((tick) => (
                  <Line
                    key={`y${tick.year}`}
                    x1={tick.x}
                    x2={tick.x}
                    y1={PAD_TOP}
                    y2={PLOT_H - PAD_BOTTOM}
                    stroke={c.borderSecondary}
                    strokeDasharray="2 4"
                  />
                ))}
                {selected ? (
                  <Line
                    x1={selected.x}
                    x2={selected.x}
                    y1={PAD_TOP - 6}
                    y2={PLOT_H - PAD_BOTTOM}
                    stroke={c.border}
                    strokeWidth={1}
                  />
                ) : null}
                {points.length > 1 ? (
                  <Polyline
                    points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={c.primary}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null}
                {splitPoints.map((p) => (
                  <Circle
                    key={p.swim.id}
                    cx={p.x}
                    cy={p.y}
                    r={r + 0.5}
                    fill={c.bgContainer}
                    stroke={c.textSecondary}
                    strokeWidth={1.5}
                  />
                ))}
                {points.map((p) => {
                  const isPb = p.swim.id === pb.id
                  const wasPb = bests.pbAtTime.has(p.swim.id)
                  return (
                    <Circle
                      key={p.swim.id}
                      cx={p.x}
                      cy={p.y}
                      r={isPb ? r + 1.5 : r}
                      fill={isPb || wasPb ? c.primary : c.textTertiary}
                      stroke={c.bgContainer}
                      strokeWidth={isPb ? 2 : 1.5}
                    />
                  )
                })}
                {selected ? (
                  <Circle
                    cx={selected.x}
                    cy={selected.y}
                    r={(selected.swim.id === pb.id ? r + 1.5 : r) + 3.5}
                    fill="none"
                    stroke={selected.overlay ? c.textSecondary : c.primary}
                    strokeWidth={1.5}
                  />
                ) : null}
                {pbPoint ? (
                  <SvgText
                    x={pbPoint.x}
                    y={pbPoint.y - r - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight="600"
                    fill={c.accent}
                  >
                    PB
                  </SvgText>
                ) : null}
                {spanMs === 0 ? (
                  <SvgText x={Y_AXIS_W + plotW / 2} y={PLOT_H + 14} textAnchor="middle" fontSize={10} fill={c.textTertiary}>
                    {formatMonthYear(new Date(firstMs))}
                  </SvgText>
                ) : (
                  <>
                    <SvgText x={Y_AXIS_W} y={PLOT_H + 14} textAnchor="start" fontSize={10} fill={c.textTertiary}>
                      {formatMonthYear(new Date(firstMs))}
                    </SvgText>
                    {yearLabels.map((tick) => (
                      <SvgText
                        key={`yl${tick.year}`}
                        x={tick.x}
                        y={PLOT_H + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={c.textTertiary}
                      >
                        {String(tick.year)}
                      </SvgText>
                    ))}
                    <SvgText x={width} y={PLOT_H + 14} textAnchor="end" fontSize={10} fill={c.textTertiary}>
                      {formatMonthYear(new Date(lastMs))}
                    </SvgText>
                  </>
                )}
              </Svg>
              </View>
            ) : null}
          </Pressable>

          <View style={styles.detail}>
            {selected ? (
              <>
                <View style={styles.detailTop}>
                  <Text style={styles.detailTime}>{formatTime(selected.swim.timeMs)}</Text>
                  {!selected.overlay && selected.swim.id === pb.id ? (
                    <Text style={styles.pbBadge}>PB</Text>
                  ) : !selected.overlay && bests.pbAtTime.has(selected.swim.id) ? (
                    <Text style={styles.pbBadgeOutline}>PB at the time</Text>
                  ) : null}
                  {improvement != null ? (
                    <Text style={[styles.delta, { color: improvement < 0 ? c.successText : c.error }]}>
                      {formatDelta(improvement)}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.detailMeta} numberOfLines={2}>
                  {[
                    formatDay(selected.swim.date),
                    selected.swim.meet || null,
                    selected.swim.relayEvent
                      ? `${selected.swim.relayEvent} · ${selected.swim.leg ? `Leg ${selected.swim.leg}` : "Split"} · Flying start`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </>
            ) : (
              <Muted>Tap the chart for a swim's details.</Muted>
            )}
          </View>
        </>
      )}

      {windowed.hasOlder ? (
        <Pressable
          onPress={() => {
            setSelectedId(null)
            setShowFullHistory((v) => !v)
          }}
          hitSlop={8}
          style={styles.historyButton}
        >
          <Text style={styles.historyText}>
            {showFullHistory ? "Show last 5 years" : `Show full history (${sel.length} swims)`}
          </Text>
        </Pressable>
      ) : null}
    </Section>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    chipRow: { flexDirection: "row", flexWrap: "nowrap", marginBottom: spacing.xs },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginTop: spacing.xxs,
      marginBottom: spacing.sm,
    },
    eyebrow: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", color: c.accent },
    pbTime: { marginTop: 2, fontSize: 28, fontWeight: "600", color: c.text, fontVariant: ["tabular-nums"] },
    switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    switchLabel: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
    single: {
      height: 88,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.border,
    },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.xs },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendText: { fontSize: 11, color: c.textTertiary },
    detail: { minHeight: 44, marginTop: spacing.xs, justifyContent: "center" },
    detailTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    detailTime: { fontSize: 15, fontWeight: "600", color: c.text, fontVariant: ["tabular-nums"] },
    pbBadge: {
      overflow: "hidden",
      borderRadius: radii.sm,
      paddingHorizontal: 6,
      paddingVertical: 1,
      fontSize: 11,
      fontWeight: "700",
      color: c.accent,
      backgroundColor: c.primaryBg,
    },
    pbBadgeOutline: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 6,
      fontSize: 11,
      fontWeight: "600",
      color: c.textTertiary,
    },
    delta: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
    detailMeta: { marginTop: 2, fontSize: 13, color: c.textSecondary },
    historyButton: { alignSelf: "flex-end", marginTop: spacing.xs },
    historyText: { fontSize: 12, fontWeight: "500", color: c.textTertiary },
  })
}

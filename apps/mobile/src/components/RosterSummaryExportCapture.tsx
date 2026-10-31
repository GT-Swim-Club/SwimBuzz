import { forwardRef, useEffect, useRef, useState } from "react"
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import {
  rosterNameFirstLast,
  rosterNamePreferred,
  rosterSummaryPngColumns,
  type MeetHeaderDetails,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfResult,
  type RosterSummaryPdfRow,
} from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { MeetExportHeader } from "./MeetExportHeader"

const COLUMN_GAP = spacing.md
/** Room for the header's date & location over a single narrow column (the meet name shrinks to fit). */
const MIN_CAPTURE_WIDTH = 480
/** Room between a row's name and its heat & lane, so they don't run together at content width. */
const NAME_GAP = 20
/** Room for the measuring pass, so no section is squeezed while it's measured. */
const MEASURE_WIDTH = 2000

/** Medley relay legs in swim order. */
const MEDLEY_STROKES = ["BK", "BR", "FL", "FR"]

/** The right-hand column as text: "58.12" (or "DQ") with its place, or the seed. */
function resultText(result: RosterSummaryPdfResult | undefined): string | null {
  if (!result) return null
  if (result.kind === "done") {
    return [result.time ?? result.status ?? "—", result.place != null ? `#${result.place}` : null]
      .filter(Boolean)
      .join("  ")
  }
  if (result.kind === "seed") return `Seed ${result.seed}`
  if (result.kind === "text") return result.text
  return null
}

/**
 * Off-screen copy of the roster summary, from the same request as the PDF, for
 * react-native-view-shot to capture as a PNG: the meet header, then the sections in balanced
 * columns, each as wide as the widest section (measured in a first layout pass). Mirrors the web
 * counterpart at apps/web/src/app/meets/[id]/RosterSummaryExportCapture.tsx.
 */
export const RosterSummaryExportCapture = forwardRef<
  View,
  { meetName: string; details: MeetHeaderDetails; iconUrl: string | null; request: RosterSummaryPdfRequest }
>(function RosterSummaryExportCapture({ meetName, details, iconUrl, request }, ref) {
  const c = usePalette()
  const styles = makeStyles(c)
  const columns = rosterSummaryPngColumns(request.sections)
  const [columnWidth, setColumnWidth] = useState<number | null>(null)
  const measured = useRef(new Map<number, number>())

  useEffect(() => {
    measured.current.clear()
    setColumnWidth(null)
  }, [request])

  function onMeasure(index: number, e: LayoutChangeEvent) {
    measured.current.set(index, e.nativeEvent.layout.width)
    if (measured.current.size === request.sections.length) {
      setColumnWidth(Math.ceil(Math.max(...measured.current.values())))
    }
  }

  /** `measuring`: at natural width, leaving out the legs (their two-up grid has no natural width). */
  const renderRow = (row: RosterSummaryPdfRow, medley: boolean, index: number, measuring = false) => {
    const legs = row.legs ?? []
    const tags = medley && legs.length === MEDLEY_STROKES.length ? MEDLEY_STROKES : null
    const result = resultText(row.result)
    return (
      <View key={index} style={[styles.row, index > 0 && styles.rowDivider]}>
        {row.eventNumber ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{row.eventNumber}</Text>
          </View>
        ) : null}
        <View style={measuring ? styles.rowTextNatural : styles.rowText}>
          <Text style={styles.label} numberOfLines={1}>
            {rosterNamePreferred(row.label)}
            {row.sub ? <Text style={styles.sub}>{`  ${row.sub}`}</Text> : null}
          </Text>
          {row.meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {row.meta}
            </Text>
          ) : null}
          {legs.length > 0 && !measuring ? (
            <View style={styles.legs}>
              {legs.map((leg, i) => (
                <View key={`${i}-${leg}`} style={styles.leg}>
                  <Text style={styles.legTag}>{tags?.[i] ?? String(i + 1)}</Text>
                  <Text style={styles.legName} numberOfLines={1}>
                    {rosterNameFirstLast(rosterNamePreferred(leg))}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {row.heatLane || row.startTime ? (
          <View style={styles.heatLane}>
            {row.heatLane ? <Text style={styles.heatLaneText}>{row.heatLane}</Text> : null}
            {row.startTime ? <Text style={styles.startTime}>{row.startTime}</Text> : null}
          </View>
        ) : null}
        {result ? <Text style={styles.result}>{result}</Text> : null}
      </View>
    )
  }

  const renderSection = (section: RosterSummaryPdfRequest["sections"][number], measuring = false) => (
    <>
      <View style={styles.cardHeader}>
        {section.eventNumber ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{section.eventNumber}</Text>
          </View>
        ) : null}
        <Text style={styles.cardTitle} numberOfLines={1}>
          {rosterNamePreferred(section.title)}
        </Text>
      </View>
      {section.rows.map((row, k) =>
        renderRow(row, /\bmedley\b/i.test(`${section.title} ${row.label}`), k, measuring)
      )}
    </>
  )

  if (columns.length > 0 && columnWidth == null) {
    // Measuring pass: each section at its natural width.
    return (
      <View ref={ref} style={[styles.root, { width: MEASURE_WIDTH, alignItems: "flex-start" }]} collapsable={false}>
        {request.sections.map((section, i) => (
          <View key={i} style={styles.card} onLayout={(e) => onMeasure(i, e)}>
            {renderSection(section, true)}
          </View>
        ))}
      </View>
    )
  }

  const width = columnWidth ?? 0
  const gridWidth = columns.length * width + COLUMN_GAP * Math.max(0, columns.length - 1)

  return (
    <View
      ref={ref}
      style={[styles.root, { width: Math.max(MIN_CAPTURE_WIDTH, gridWidth + spacing.xl * 2) }]}
      collapsable={false}
    >
      <MeetExportHeader
        eyebrow={request.heading ?? "Entries"}
        meetName={meetName}
        details={details}
        iconUrl={iconUrl}
      />
      {columns.length === 0 ? (
        <Text style={styles.meta}>No entries match these filters.</Text>
      ) : (
        <View style={styles.grid}>
          {columns.map((column, i) => (
            <View key={i} style={[styles.column, { width }]}>
              {column.map((section, j) => (
                <View key={j} style={styles.card}>
                  {renderSection(section)}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  )
})

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: {
      padding: spacing.xl,
      gap: spacing.lg,
      backgroundColor: c.bgLayout,
    },
    grid: { flexDirection: "row", alignItems: "flex-start", columnGap: COLUMN_GAP },
    column: { gap: spacing.md },
    card: {
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: "hidden",
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      borderBottomColor: c.borderSubtle,
      borderBottomWidth: 1,
    },
    cardTitle: { color: c.text, fontSize: 14, fontWeight: "600", flexShrink: 1 },
    badge: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: 22,
      height: 22,
      paddingHorizontal: 4,
      borderRadius: 11,
      borderWidth: 1,
      // Dark mode's primaryBorder is white; the web badge is gold-outlined.
      borderColor: c.accent,
      backgroundColor: c.primaryBg,
    },
    badgeText: { color: c.accent, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      paddingVertical: 7,
    },
    rowDivider: { borderTopColor: c.borderSubtle, borderTopWidth: 1 },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
    rowTextNatural: { flexShrink: 0, gap: 2 },
    label: { color: c.text, fontSize: 14, fontWeight: "500" },
    sub: { color: c.textTertiary, fontSize: 12, fontWeight: "400" },
    meta: { color: c.textTertiary, fontSize: 12 },
    legs: { flexDirection: "row", flexWrap: "wrap", rowGap: 1 },
    leg: { width: "50%", flexDirection: "row", alignItems: "baseline", gap: 5, paddingRight: spacing.xs },
    legTag: { width: 16, color: c.textTertiary, fontSize: 9, fontWeight: "700" },
    legName: { flexShrink: 1, color: c.textSecondary, fontSize: 12 },
    heatLane: { alignItems: "flex-end", marginLeft: NAME_GAP },
    heatLaneText: { color: c.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] },
    startTime: { color: c.textTertiary, fontSize: 12, fontVariant: ["tabular-nums"] },
    result: { color: c.text, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  })
}

import { forwardRef, useEffect, useRef, useState } from "react"
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import {
  formatOrdinal,
  highlightTileRows,
  relayLegSubSplitsText,
  rosterSummaryRowLegSubSplitsText,
  rosterNameFirstLast,
  rosterNamePreferred,
  rosterSummaryExportSections,
  rosterSummaryPngColumns,
  type MeetHeaderDetails,
  type StatCounter,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfResult,
  type RosterSummaryPdfRow,
} from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { TeamPill, teamPillColumnWidth } from "./TeamPill"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { MeetExportHeader } from "./MeetExportHeader"
import { HighlightTile } from "./MeetHighlightsCarousel"
import { Icon } from "./Icon"

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

/** A highlights export's tiles in rows (the header's eyebrow names them). */
function CaptureHighlights({ counters }: { counters: StatCounter[] }) {
  const c = usePalette()
  const styles = makeStyles(c)
  const rows = highlightTileRows(counters)
  if (rows.length === 0) return null
  return (
    <View style={styles.highlights}>
      {rows.map(({ counters: row, perRow }, i) => (
        <View key={i} style={styles.tileRow}>
          {row.map((counter) => (
            <HighlightTile key={counter.label} counter={counter} hintBesideLabel medalPlaces />
          ))}
          {/* A short row keeps its tiles the width of a full row's. */}
          {Array.from({ length: perRow - row.length }, (_, k) => (
            <View key={`gap-${k}`} style={styles.tileSpacer} />
          ))}
        </View>
      ))}
    </View>
  )
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
  const columns = rosterSummaryPngColumns(request)
  // At a meet split by team, each team's tiles and lists in turn under the team scores.
  const teams = request.highlights?.teams ?? []
  const teamColumns = teams.map((team) => rosterSummaryPngColumns({ sections: [], highlights: team }))
  // Every section (the meet's and each team's) is measured, so all columns share one width.
  const sections = [
    ...rosterSummaryExportSections(request),
    ...teams.flatMap((team) => rosterSummaryExportSections({ sections: [], highlights: team })),
  ]
  const [columnWidth, setColumnWidth] = useState<number | null>(null)
  const measured = useRef(new Map<number, number>())
  // One team pill column width for every row, from the longest team named on any of them.
  const rowTeams = sections.flatMap((section) => section.rows.flatMap((row) => row.team ?? []))
  const teamWidth = rowTeams.length > 0 ? teamPillColumnWidth(rowTeams) : 0

  useEffect(() => {
    measured.current.clear()
    setColumnWidth(null)
  }, [request])

  function onMeasure(index: number, e: LayoutChangeEvent) {
    measured.current.set(index, e.nativeEvent.layout.width)
    if (measured.current.size === sections.length) {
      setColumnWidth(Math.ceil(Math.max(...measured.current.values())))
    }
  }

  /** `measuring`: at natural width, leaving out the legs (their two-up grid has no natural width). */
  const renderRow = (
    row: RosterSummaryPdfRow,
    medley: boolean,
    index: number,
    measuring = false,
    previous?: RosterSummaryPdfRow
  ) => {
    const legs = row.legs ?? []
    // A relay athlete's leg 50s lead the line under the label (the PDF sets them in split columns).
    const meta = [rosterSummaryRowLegSubSplitsText(row), row.meta].filter(Boolean).join(" · ")
    const tags = medley && legs.length === MEDLEY_STROKES.length ? MEDLEY_STROKES : null
    const result = resultText(row.result)
    if (row.subheading) {
      return (
        <Text key={index} style={styles.subheading}>
          {row.label}
        </Text>
      )
    }
    return (
      <View key={index} style={[styles.row, index > 0 && !previous?.subheading && styles.rowDivider]}>
        {row.eventNumber ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{row.eventNumber}</Text>
          </View>
        ) : row.place ? (
          <Text style={styles.leadPlace}>{formatOrdinal(row.place)}</Text>
        ) : null}
        <View style={measuring ? styles.rowTextNatural : styles.rowText}>
          <Text style={styles.label} numberOfLines={1}>
            {rosterNamePreferred(row.label)}
            {/* " (4th)", lighter — like a preferred name's parentheses. */}
            {row.labelNote ? <Text style={styles.labelNote}>{` (${row.labelNote})`}</Text> : null}
            {row.sub ? <Text style={styles.sub}>{`  ${row.sub}`}</Text> : null}
          </Text>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {legs.length > 0 && !measuring ? (
            <View style={styles.legs}>
              {legs.map((leg, i) => (
                // The leg line, then any sub-splits (the leg's own 50s) under the name.
                <View key={`${i}-${leg}`} style={styles.legCell}>
                  <View style={styles.leg}>
                    <Text style={styles.legTag}>{tags?.[i] ?? String(i + 1)}</Text>
                    <Text style={styles.legName} numberOfLines={1}>
                      {rosterNameFirstLast(rosterNamePreferred(leg))}
                    </Text>
                    {row.legSplits?.[i] ? <Text style={styles.legSplit}>{row.legSplits[i]}</Text> : null}
                  </View>
                  {row.legSubSplits?.[i]?.length ? (
                    <Text style={[styles.legSplit, styles.legSubSplits]} numberOfLines={1}>
                      {relayLegSubSplitsText(row.legSubSplits[i])}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {row.cuts?.map((cut) => (
            <View key={cut.event} style={styles.cut}>
              <Text style={[styles.cutEvent, !measuring && styles.cutEventFill]}>{cut.event}</Text>
              <Text style={[styles.cutDelta, { color: cut.delta.startsWith("-") ? c.successText : c.error }]}>
                {cut.delta.replace(/^-/, "−")}
              </Text>
              <Text style={styles.cutTime}>{cut.time}</Text>
              {/* The cut, after the time and quieter. */}
              <Text style={styles.cutStandard}>{cut.cut}</Text>
            </View>
          ))}
        </View>
        {teamWidth ? (
          // The team pills in a column of their own, before the heat & lane and result.
          <View style={[styles.teamColumn, { width: teamWidth }]}>
            {row.team ? <TeamPill team={row.team} tone={row.teamTone} /> : null}
          </View>
        ) : null}
        {row.heatLane || row.startTime ? (
          <View style={styles.heatLane}>
            {row.heatLane ? <Text style={styles.heatLaneText}>{row.heatLane}</Text> : null}
            {row.startTime ? <Text style={styles.startTime}>{row.startTime}</Text> : null}
          </View>
        ) : null}
        {result ? (
          // A relay athlete's split under the result, the two centered together on the row.
          <View style={styles.resultColumn}>
            <Text style={styles.result}>{result}</Text>
            {row.resultNote ? <Text style={styles.resultNote}>{row.resultNote}</Text> : null}
          </View>
        ) : null}
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
        ) : section.icon ? (
          <Icon name={section.icon} size={18} color={c.accent} />
        ) : null}
        <Text style={styles.cardTitle} numberOfLines={1}>
          {rosterNamePreferred(section.title)}
        </Text>
        {section.team ? <TeamPill team={section.team} tone={section.teamTone} /> : null}
      </View>
      {section.rows.map((row, k) =>
        renderRow(row, /\bmedley\b/i.test(`${section.title} ${row.label}`), k, measuring, section.rows[k - 1])
      )}
    </>
  )

  if (sections.length > 0 && columnWidth == null) {
    // Measuring pass: each section at its natural width.
    return (
      <View ref={ref} style={[styles.root, { width: MEASURE_WIDTH, alignItems: "flex-start" }]} collapsable={false}>
        {sections.map((section, i) => (
          <View key={i} style={styles.card} onLayout={(e) => onMeasure(i, e)}>
            {renderSection(section, true)}
          </View>
        ))}
      </View>
    )
  }

  const width = columnWidth ?? 0
  const columnCount = Math.max(columns.length, ...teamColumns.map((team) => team.length))
  const gridWidth = columnCount * width + COLUMN_GAP * Math.max(0, columnCount - 1)

  const renderGrid = (gridColumns: RosterSummaryPdfRequest["sections"][]) => (
    <View style={styles.grid}>
      {gridColumns.map((column, i) => (
        <View key={i} style={[styles.column, { width }]}>
          {column.map((section, j) => (
            <View key={j} style={styles.card}>
              {renderSection(section)}
            </View>
          ))}
        </View>
      ))}
    </View>
  )

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
      {request.highlights ? <CaptureHighlights counters={request.highlights.counters} /> : null}
      {teams.map((team, i) => (
        <View key={team.team} style={styles.team}>
          <Text style={styles.teamHeading}>{team.team.toUpperCase()}</Text>
          <CaptureHighlights counters={team.counters} />
          {teamColumns[i].length > 0 ? renderGrid(teamColumns[i]) : null}
        </View>
      ))}
      {columns.length === 0 ? (
        request.highlights ? null : <Text style={styles.meta}>No entries match these filters.</Text>
      ) : (
        renderGrid(columns)
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
    highlights: { gap: spacing.xs },
    team: { gap: spacing.md },
    teamHeading: { color: c.accent, fontSize: 14, fontWeight: "700", letterSpacing: 2 },
    tileRow: { flexDirection: "row", gap: spacing.xs },
    tileSpacer: { flex: 1 },
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
      // Gold-outlined, like the web badge.
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
    leadPlace: { width: 30, alignSelf: "flex-start", color: c.textSecondary, fontSize: 12, fontWeight: "700", lineHeight: 19 },
    subheading: {
      marginHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: 2,
      color: c.accent,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
    rowTextNatural: { flexShrink: 0, gap: 2 },
    label: { color: c.text, fontSize: 14, fontWeight: "500" },
    sub: { color: c.textTertiary, fontSize: 12, fontWeight: "400" },
    meta: { color: c.textTertiary, fontSize: 12 },
    legs: { flexDirection: "row", flexWrap: "wrap", rowGap: 1 },
    legCell: { width: "50%", paddingRight: spacing.xs },
    leg: { flexDirection: "row", alignItems: "baseline", gap: 5 },
    /** Under the name: the leg tag's width plus the gap. */
    legSubSplits: { paddingLeft: 21 },
    legTag: { width: 16, color: c.textTertiary, fontSize: 9, fontWeight: "700" },
    legName: { flexShrink: 1, color: c.textSecondary, fontSize: 12 },
    legSplit: { color: c.textTertiary, fontSize: 12, fontVariant: ["tabular-nums"] },
    cut: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
    cutEvent: { minWidth: 72, color: c.textSecondary, fontSize: 12, marginRight: NAME_GAP },
    cutEventFill: { flex: 1 },
    cutStandard: { minWidth: 52, textAlign: "right", color: c.textTertiary, fontSize: 12, fontVariant: ["tabular-nums"] },
    cutDelta: { fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
    cutTime: { minWidth: 52, textAlign: "right", color: c.text, fontSize: 13, fontVariant: ["tabular-nums"] },
    heatLane: { alignItems: "flex-end", marginLeft: NAME_GAP },
    heatLaneText: { color: c.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] },
    startTime: { color: c.textTertiary, fontSize: 12, fontVariant: ["tabular-nums"] },
    result: { color: c.text, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
    resultColumn: { alignItems: "flex-end" },
    resultNote: { color: c.textTertiary, fontSize: 12, fontVariant: ["tabular-nums"] },
    labelNote: { color: c.textSecondary, fontWeight: "400" },
    teamColumn: { alignItems: "flex-start", marginLeft: NAME_GAP },
  })
}

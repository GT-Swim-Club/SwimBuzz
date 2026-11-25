import { useMemo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useQuery } from "@tanstack/react-query"
import {
  formatRecordTime,
  MANUAL_RECORD_LABEL,
  MANUAL_RECORD_MARK,
  recordSwimmerLabel,
  topTimesEventTitle,
  type TopTimesMode,
} from "@swimbuzz/shared"
import { ErrorBlock, Skeleton, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../lib/api"
import { recordsErrorMessage } from "./RecordSheets"

/**
 * Every record event's top 10 for one gender: a card per event, in records-table order, with each line's
 * rank, swimmer(s), year and time (this season's in gold).
 */
export function RecordTopTimesBoard({ gender, mode }: { gender: "F" | "M"; mode: TopTimesMode }) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const { data, isPending, error } = useQuery({
    queryKey: ["records", "top", "all", gender, mode],
    queryFn: () => api.getAllRecordTopTimes(gender, mode),
  })
  if (error) return <ErrorBlock message={recordsErrorMessage(error, "Couldn't load the top 10")} />
  if (isPending) return <TopTimesSkeleton styles={styles} />

  return (
    <View>
      {data.events.map((event) => (
        <View key={`${event.gender}|${event.event}`} style={[styles.card, styles.eventCard]}>
          <View style={styles.eventHeader}>
            <Text accessibilityRole="header" style={styles.eventTitle}>
              {topTimesEventTitle(event)}
            </Text>
          </View>
          {event.times.length === 0 ? <Text style={styles.empty}>No swims yet.</Text> : null}
          {event.times.map((time, index) => {
            const tied = event.times[index - 1]?.rank === time.rank || event.times[index + 1]?.rank === time.rank
            const season = time.isThisSeason ? styles.thisSeason : null
            return (
              <View key={time.key} style={[styles.row, index > 0 && styles.rowDivider]}>
                <Text style={styles.rank} accessibilityLabel={tied ? `Tied ${time.rank}` : String(time.rank)}>
                  {time.manual ? <Text style={styles.manualMark}>{MANUAL_RECORD_MARK}</Text> : null}
                  {tied ? `T${time.rank}` : time.rank}
                </Text>
                <View style={styles.names}>
                  {time.swimmers.map((swimmer, i) => (
                    <Text key={i} numberOfLines={1} style={[styles.name, season]}>
                      {recordSwimmerLabel(time, swimmer)}
                    </Text>
                  ))}
                </View>
                <Text style={[styles.year, season]}>{time.year}</Text>
                <Text style={[styles.time, season]}>
                  {formatRecordTime(time.timeMs)}
                </Text>
              </View>
            )
          })}
        </View>
      ))}
      {data.events.some((event) => event.times.some((time) => time.manual)) ? (
        <Text style={styles.footnote}>
          <Text style={styles.manualMark}>{MANUAL_RECORD_MARK}</Text> {MANUAL_RECORD_LABEL}
        </Text>
      ) : null}
    </View>
  )
}

/** Name widths per line, varied so the cards don't look stamped. */
const NAME_WIDTHS = ["45%", "55%", "40%", "60%", "50%", "35%", "55%", "40%", "50%", "55%"] as const

/** Mirrors the board: event cards, each a title band over ten rank · name · year · time lines. */
function TopTimesSkeleton({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return (
    <View accessibilityState={{ busy: true }}>
      {Array.from({ length: 3 }, (_, card) => (
        <View key={card} style={[styles.card, styles.eventCard]}>
          <View style={styles.eventHeader}>
            <Skeleton style={styles.skeletonTitle} />
          </View>
          {NAME_WIDTHS.map((_, line) => (
            <View key={line} style={[styles.row, styles.skeletonRow, line > 0 && styles.rowDivider]}>
              <Skeleton style={{ height: 13, width: 18, marginLeft: 8 }} />
              <View style={styles.names}>
                <Skeleton style={{ height: 13, width: NAME_WIDTHS[(line + card * 3) % NAME_WIDTHS.length] }} />
              </View>
              <Skeleton style={{ height: 13, width: 32 }} />
              <Skeleton style={{ height: 13, width: 48 }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: "hidden",
    },
    eventCard: { marginBottom: spacing.sm },
    eventHeader: {
      alignItems: "center",
      backgroundColor: c.fillSecondary,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 2,
    },
    eventTitle: { color: c.text, fontSize: 15, fontWeight: "700" },
    empty: { color: c.textTertiary, fontSize: 13, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
    row: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 7,
    },
    /** The title band is fillSecondary like the Skeleton, so its bar takes the border shade to show. */
    skeletonTitle: { backgroundColor: c.border, height: 15, marginVertical: 2, width: "50%" },
    skeletonRow: { alignItems: "center", paddingVertical: 10 },
    rowDivider: { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth },
    rank: {
      color: c.textTertiary,
      fontSize: 14,
      fontVariant: ["tabular-nums"],
      fontWeight: "700",
      minWidth: 26,
      textAlign: "right",
    },
    names: { flex: 1, gap: 1, minWidth: 0 },
    name: { color: c.text, fontSize: 14 },
    year: { color: c.textTertiary, fontSize: 13, fontVariant: ["tabular-nums"], paddingTop: 1 },
    time: { color: c.text, fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "700", minWidth: 58, textAlign: "right" },
    thisSeason: { color: c.accent, fontWeight: "800" },
    /** The gold "*" before a manually added time's rank. */
    manualMark: { color: c.accent },
    footnote: { color: c.textSecondary, fontSize: 13, marginBottom: spacing.md },
  })
}

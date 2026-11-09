import { forwardRef } from "react"
import { StyleSheet, Text, View } from "react-native"
import {
  RECORDS_EXPORT,
  recordSwimmerName,
  recordTimeLabel,
  type RecordGender,
  type TeamRecordItem,
  type TeamRecordRow,
} from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"

/** The sheet's width: both genders side by side, like the web's wide records table. */
const CAPTURE_WIDTH = 1060
const YEAR_WIDTH = 56
/** Room for a lead-off time with its "(R)" ("1:08.94 (R)"). */
const TIME_WIDTH = 104
/** Fits the club's name in the header band. */
const EVENT_WIDTH = 290

/**
 * Off-screen copy of the records sheet — women's year, name and time mirrored against men's around
 * the event column, this season's records in bold gold, the date in the mixed relay's empty men's
 * cell — rendered at a fixed width for
 * react-native-view-shot to capture as a PNG. Mirrors the web counterpart at
 * apps/web/src/app/records/RecordsExportCapture.tsx.
 */
export const RecordsExportCapture = forwardRef<View, { rows: TeamRecordRow[]; asOf: string }>(
  function RecordsExportCapture({ rows, asOf }, ref) {
    const c = usePalette()
    const styles = makeStyles(c)

    function side(record: TeamRecordItem | undefined, mirrored: boolean) {
      const season = record?.isThisSeason ? styles.thisSeason : null
      const empty = <Text style={styles.empty}>—</Text>
      const cells = [
        <View key="year" style={[styles.cell, { width: YEAR_WIDTH }]}>
          {record ? <Text style={[styles.text, styles.number, season]}>{record.year}</Text> : empty}
        </View>,
        <View key="names" style={[styles.cell, styles.names]}>
          {record
            ? record.swimmers.map((swimmer, i) => (
                <Text key={i} numberOfLines={1} style={[styles.text, season]}>
                  {recordSwimmerName(swimmer)}
                </Text>
              ))
            : empty}
        </View>,
        <View key="time" style={[styles.cell, { width: TIME_WIDTH }]}>
          {record ? <Text style={[styles.text, styles.number, season]}>{recordTimeLabel(record)}</Text> : empty}
        </View>,
      ]
      return mirrored ? cells.reverse() : cells
    }

    const labels = (mirrored: boolean) => {
      const cells = [
        <Text key="year" style={[styles.columnLabel, { width: YEAR_WIDTH }]}>YEAR</Text>,
        <Text key="name" style={[styles.columnLabel, styles.names]}>NAME</Text>,
        <Text key="time" style={[styles.columnLabel, { width: TIME_WIDTH }]}>TIME</Text>,
      ]
      return mirrored ? cells.reverse() : cells
    }

    return (
      <View ref={ref} style={[styles.root, { width: CAPTURE_WIDTH }]} collapsable={false}>
        <View style={styles.table}>
          <View style={[styles.row, styles.band]}>
            <Text style={[styles.bandText, styles.side]}>WOMEN&apos;S RECORDS</Text>
            <Text style={[styles.bandText, styles.event]} numberOfLines={1}>
              {RECORDS_EXPORT.eyebrow.toUpperCase()}
            </Text>
            <Text style={[styles.bandText, styles.side]}>MEN&apos;S RECORDS</Text>
          </View>
          <View style={[styles.row, styles.labels]}>
            {labels(false)}
            <Text style={[styles.columnLabel, styles.event]}>EVENT</Text>
            {labels(true)}
          </View>
          {rows.map((row, index) => {
            const groupStart = index > 0 && rows[index - 1]!.group !== row.group
            const mixed = row.genders.length === 1 && row.genders[0] === "X"
            const record = (gender: RecordGender) => row.records[gender]
            return (
              <View
                key={`${row.genders.join("")}|${row.event}`}
                style={[styles.row, index > 0 && (groupStart || row.relay ? styles.groupDivider : styles.divider)]}
              >
                {side(record(mixed ? "X" : "F"), false)}
                <View style={[styles.cell, styles.event]}>
                  <Text style={[styles.text, styles.eventText]}>{row.label}</Text>
                </View>
                {mixed ? (
                  <View style={styles.mixedEmpty}>
                    <Text style={styles.asOf}>{asOf}</Text>
                  </View>
                ) : (
                  side(record("M"), true)
                )}
              </View>
            )
          })}
        </View>
      </View>
    )
  }
)

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: { padding: spacing.sm, backgroundColor: c.bgLayout },
    table: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "stretch" },
    band: { backgroundColor: c.fillSecondary, borderBottomColor: c.border, borderBottomWidth: 1 },
    bandText: {
      color: c.accent,
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: 1.6,
      paddingVertical: 10,
      textAlign: "center",
    },
    asOf: { color: c.textSecondary, fontSize: 12 },
    // Half of what the event column leaves, the same as a row's year, names and time.
    side: { flex: 1 },
    labels: { borderBottomColor: c.fill, borderBottomWidth: 1 },
    columnLabel: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1.2,
      paddingVertical: 4,
      textAlign: "center",
    },
    event: {
      width: EVENT_WIDTH,
      borderLeftColor: c.border,
      borderLeftWidth: 1,
      borderRightColor: c.border,
      borderRightWidth: 1,
    },
    divider: { borderTopColor: c.border, borderTopWidth: 1 },
    groupDivider: { borderTopColor: c.fill, borderTopWidth: 1 },
    // Tight rows like the club's records spreadsheet: a relay's four legs stack at the line height.
    cell: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs, paddingVertical: 4 },
    names: { flex: 1, minWidth: 0 },
    text: { color: c.text, fontSize: 15, lineHeight: 22, textAlign: "center" },
    number: { fontVariant: ["tabular-nums"] },
    eventText: { fontWeight: "500" },
    empty: { color: c.textTertiary, fontSize: 15, lineHeight: 22 },
    thisSeason: { color: c.accent, fontWeight: "800" },
    // Grows like the names column from the year and time columns' width, so it lines up with a men's side.
    // The date sits at its bottom right.
    mixedEmpty: {
      alignItems: "flex-end",
      backgroundColor: c.fill,
      flexBasis: YEAR_WIDTH + TIME_WIDTH,
      flexGrow: 1,
      justifyContent: "flex-end",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
  })
}

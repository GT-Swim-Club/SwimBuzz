import { useMemo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useQuery } from "@tanstack/react-query"
import {
  formatRecordTime,
  MANUAL_RECORD_LABEL,
  MANUAL_RECORD_MARK,
  recordSetLabel,
  recordSwimmerLabel,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordItem,
} from "@swimbuzz/shared"
import { BottomSheet, ErrorBlock, LoadingBlock, Muted, ScrollView, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../lib/api"

/** One gender's record in one event — what the history sheet shows. */
export type RecordTarget = { def: RecordEventDef; gender: RecordGender; record: TeamRecordItem | undefined }

export function recordTitle({ def, gender }: Pick<RecordTarget, "def" | "gender">): string {
  return `${gender === "F" ? "Women" : gender === "M" ? "Men" : ""} ${def.label}`.trim()
}

export function recordsErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** An event's record history as its own sheet (tapping a record or a Top 10 event). */
export function RecordHistorySheet({
  target,
  onClose,
}: {
  target: Pick<RecordTarget, "def" | "gender">
  onClose: () => void
}) {
  return (
    <BottomSheet visible onClose={onClose} title={recordTitle(target)}>
      <RecordHistoryList target={target} />
    </BottomSheet>
  )
}

/** An event's records, newest first; the first is the current record. */
function RecordHistoryList({ target }: { target: Pick<RecordTarget, "def" | "gender"> }) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const { def, gender } = target
  const { data, isPending, error } = useQuery({
    queryKey: ["records", "history", gender, def.event],
    queryFn: () => api.getRecordHistory(gender, def.event),
  })
  return (
    <ScrollView style={styles.sheetScroll}>
      {error ? <ErrorBlock message={recordsErrorMessage(error, "Couldn't load history")} /> : null}
      {isPending ? <LoadingBlock /> : null}
      {data && data.records.length === 0 ? <Muted>No record yet.</Muted> : null}
      {data && data.records.length > 0 ? (
        <View style={styles.historyList}>
          {data.records.map((record, index) => (
            <View key={record.id} style={[styles.historyRow, index > 0 && styles.historyDivider]}>
              <View style={styles.historyMain}>
                {record.swimmers.map((swimmer, i) => (
                  <Text key={i} style={styles.historyName}>
                    {recordSwimmerLabel(record, swimmer)}
                  </Text>
                ))}
                <Text style={styles.historyMeta}>{recordSetLabel(record)}</Text>
                {record.manual ? (
                  <Text style={styles.historyMeta}>
                    <Text style={styles.manualMark}>{MANUAL_RECORD_MARK}</Text> {MANUAL_RECORD_LABEL}
                  </Text>
                ) : null}
                {index === 0 ? <Text style={styles.historySource}>Current</Text> : null}
              </View>
              <Text style={[styles.historyTime, record.isThisSeason && styles.thisSeason]}>
                {record.manual ? <Text style={styles.manualMark}>{MANUAL_RECORD_MARK}</Text> : null}
                {formatRecordTime(record.timeMs)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    sheetScroll: { maxHeight: 520 },
    historyList: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: "hidden",
    },
    historyRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
    historyDivider: { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth },
    historyMain: { flex: 1, gap: 2 },
    historyName: { color: c.text, fontSize: 15, fontWeight: "600" },
    historyMeta: { color: c.textSecondary, fontSize: 13, marginTop: 2 },
    historySource: { color: c.textTertiary, fontSize: 12 },
    historyTime: { color: c.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "700" },
    thisSeason: { color: c.accent, fontWeight: "800" },
    /** The gold "*" before a manually added record's time. */
    manualMark: { color: c.accent },
  })
}

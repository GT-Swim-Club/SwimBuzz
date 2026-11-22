import { useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import {
  formatRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordItem,
  type TeamRecordSource,
  type TopTimesMode,
} from "@swimbuzz/shared"
import { BottomSheet, ErrorBlock, LoadingBlock, Muted, ScrollView, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../lib/api"
import { SegmentedOption, SegmentedToggle } from "./SegmentedToggle"

/** One gender's record in one event — what the history sheet shows. */
export type RecordTarget = { def: RecordEventDef; gender: RecordGender; record: TeamRecordItem | undefined }

const SOURCE_LABELS: Record<TeamRecordSource, string> = {
  meet: "From meet results",
  manual: "Set by staff",
  seed: "Records sheet",
}

export function recordTitle({ def, gender }: Pick<RecordTarget, "def" | "gender">): string {
  return `${gender === "F" ? "Women's" : gender === "M" ? "Men's" : ""} ${def.label}`.trim()
}

export function recordsErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

type SheetView = "history" | "top"

const VIEWS: Array<{ value: SheetView; label: string }> = [
  { value: "history", label: "History" },
  { value: "top", label: "Top 10" },
]

const MODES: Array<{ value: TopTimesMode; label: string }> = [
  { value: "performers", label: "Performers" },
  { value: "performances", label: "Performances" },
]

/**
 * An event's history and top 10 as its own sheet (tapping a record). Top 10 shows
 * each swimmer's best (performers) or the fastest swims (performances); relays only the latter.
 */
export function RecordHistorySheet({
  target,
  onClose,
}: {
  target: Pick<RecordTarget, "def" | "gender">
  onClose: () => void
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const [view, setView] = useState<SheetView>("history")
  const [mode, setMode] = useState<TopTimesMode>("performers")
  return (
    <BottomSheet visible onClose={onClose} title={recordTitle(target)}>
      <View style={styles.toggles}>
        <SegmentedToggle selectedIndex={VIEWS.findIndex((v) => v.value === view)} fill>
          {VIEWS.map((v) => (
            <SegmentedOption
              key={v.value}
              flex
              selected={v.value === view}
              accessibilityLabel={v.label}
              onPress={() => setView(v.value)}
            >
              <Text style={[styles.toggleText, v.value === view && styles.toggleTextOn]}>{v.label}</Text>
            </SegmentedOption>
          ))}
        </SegmentedToggle>
        {view === "top" && !target.def.relay ? (
          <SegmentedToggle selectedIndex={MODES.findIndex((m) => m.value === mode)} fill>
            {MODES.map((m) => (
              <SegmentedOption
                key={m.value}
                flex
                selected={m.value === mode}
                accessibilityLabel={m.label}
                onPress={() => setMode(m.value)}
              >
                <Text style={[styles.toggleText, m.value === mode && styles.toggleTextOn]}>{m.label}</Text>
              </SegmentedOption>
            ))}
          </SegmentedToggle>
        ) : null}
      </View>
      {view === "history" ? (
        <RecordHistoryList target={target} onNavigate={onClose} />
      ) : (
        <RecordTopTimesList target={target} mode={mode} onNavigate={onClose} />
      )}
    </BottomSheet>
  )
}

/** An event's top 10 for one gender; ties share a rank ("T3"), so the list can run past ten. */
function RecordTopTimesList({
  target,
  mode,
  onNavigate,
}: {
  target: Pick<RecordTarget, "def" | "gender">
  mode: TopTimesMode
  /** Close the sheet before leaving for an athlete's profile. */
  onNavigate: () => void
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const router = useRouter()
  const { def, gender } = target
  const shownMode: TopTimesMode = def.relay ? "performances" : mode
  const { data, isPending, error } = useQuery({
    queryKey: ["records", "top", gender, def.event, shownMode],
    queryFn: () => api.getRecordTopTimes(gender, def.event, shownMode),
  })

  return (
    <ScrollView style={styles.sheetScroll}>
      {error ? <ErrorBlock message={recordsErrorMessage(error, "Couldn't load the top 10")} /> : null}
      {isPending ? <LoadingBlock /> : null}
      {data && data.times.length === 0 ? <Muted>No swims yet.</Muted> : null}
      {data && data.times.length > 0 ? (
        <View style={styles.historyList}>
          {data.times.map((time, index) => {
            const tied = data.times[index - 1]?.rank === time.rank || data.times[index + 1]?.rank === time.rank
            return (
              <View key={time.key} style={[styles.historyRow, index > 0 && styles.historyDivider]}>
                <Text style={styles.rank} accessibilityLabel={tied ? `Tied ${time.rank}` : String(time.rank)}>
                  {tied ? `T${time.rank}` : time.rank}
                </Text>
                <View style={styles.historyMain}>
                  {time.swimmers.map((swimmer, i) =>
                    swimmer.athleteSlug ? (
                      <Pressable
                        key={i}
                        accessibilityRole="link"
                        onPress={() => {
                          onNavigate()
                          router.push(`/roster/${swimmer.athleteSlug}`)
                        }}
                      >
                        <Text style={[styles.historyName, styles.historyLink]}>{recordSwimmerLabel(time, swimmer)}</Text>
                      </Pressable>
                    ) : (
                      <Text key={i} style={styles.historyName}>
                        {recordSwimmerLabel(time, swimmer)}
                      </Text>
                    )
                  )}
                  <Text style={styles.historyMeta}>{recordSetLabel(time)}</Text>
                  {time.isRecord ? <Text style={styles.recordTag}>RECORD</Text> : null}
                </View>
                <Text style={[styles.historyTime, time.isThisSeason && styles.thisSeason]}>
                  {formatRecordTime(time.timeMs)}
                </Text>
              </View>
            )
          })}
        </View>
      ) : null}
    </ScrollView>
  )
}

/** An event's records, newest first; the first is the current record. */
function RecordHistoryList({
  target,
  onNavigate,
}: {
  target: Pick<RecordTarget, "def" | "gender">
  /** Close the sheet before leaving for an athlete's profile. */
  onNavigate: () => void
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const router = useRouter()
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
                {record.swimmers.map((swimmer, i) =>
                  swimmer.athleteSlug ? (
                    <Pressable
                      key={i}
                      accessibilityRole="link"
                      onPress={() => {
                        onNavigate()
                        router.push(`/roster/${swimmer.athleteSlug}`)
                      }}
                    >
                      <Text style={[styles.historyName, styles.historyLink]}>{recordSwimmerLabel(record, swimmer)}</Text>
                    </Pressable>
                  ) : (
                    <Text key={i} style={styles.historyName}>
                      {recordSwimmerLabel(record, swimmer)}
                    </Text>
                  )
                )}
                <Text style={styles.historyMeta}>{recordSetLabel(record)}</Text>
                <Text style={styles.historySource}>
                  {index === 0 ? "Current · " : ""}
                  {SOURCE_LABELS[record.source]}
                </Text>
              </View>
              <Text style={[styles.historyTime, record.isThisSeason && styles.thisSeason]}>
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
    historyLink: { color: c.primaryActive },
    historyMeta: { color: c.textSecondary, fontSize: 13, marginTop: 2 },
    historySource: { color: c.textTertiary, fontSize: 12 },
    historyTime: { color: c.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "700" },
    thisSeason: { color: c.accent, fontWeight: "800" },
    toggles: { gap: spacing.xs, marginBottom: spacing.sm },
    toggleText: { color: c.textSecondary, fontSize: 14, fontWeight: "700" },
    toggleTextOn: { color: c.primaryContrast },
    rank: {
      color: c.textTertiary,
      fontSize: 15,
      fontVariant: ["tabular-nums"],
      fontWeight: "700",
      minWidth: 28,
      textAlign: "right",
    },
    recordTag: { color: c.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  })
}

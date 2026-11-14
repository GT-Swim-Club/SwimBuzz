import { useMemo, useState } from "react"
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  formatRecordTime,
  isRecordEditable,
  parseRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordItem,
  type TeamRecordSource,
  type TeamRecordsResponse,
  type TopTimesMode,
} from "@swimbuzz/shared"
import { BottomSheet, Button, ErrorBlock, LoadingBlock, Muted, ScrollView, TextField, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../lib/api"
import { SegmentedOption, SegmentedToggle } from "./SegmentedToggle"

/** One gender's record in one event — what a sheet acts on. */
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

/**
 * Staff edit of one record: time, year, holder (or relay legs) and the lead-off mark. Saving a later
 * year than the current record's makes it a new record; otherwise it corrects the current one.
 */
export function RecordEditSheet({ target, onClose }: { target: RecordTarget; onClose: () => void }) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const queryClient = useQueryClient()
  const { def, gender, record } = target
  const [time, setTime] = useState(record ? formatRecordTime(record.timeMs) : "")
  const [year, setYear] = useState(record ? String(record.year) : "")
  const [names, setNames] = useState(() =>
    Array.from({ length: def.relay ? 4 : 1 }, (_, i) => record?.swimmers[i]?.name ?? "")
  )
  const [leadoff, setLeadoff] = useState(record?.leadoff ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function done(next: TeamRecordsResponse) {
    queryClient.setQueryData(["records"], next)
    void queryClient.invalidateQueries({ queryKey: ["records", "history"] })
    void queryClient.invalidateQueries({ queryKey: ["records", "top"] })
    onClose()
  }

  async function save() {
    if (!parseRecordTime(time)) return setError("Enter a time like 1:38.65 or 22.29")
    if (!/^\d{4}$/.test(year.trim())) return setError("Enter the year")
    if (!def.relay && !names[0]?.trim()) return setError("Enter the swimmer's name")
    // Same year keeps the record's date; a new year makes it year-only.
    const date = record?.date && year.trim() === String(record.year) ? record.date.slice(0, 10) : null
    setBusy(true)
    setError(null)
    try {
      done(
        await api.updateRecord({
          gender,
          event: def.event,
          time: time.trim(),
          year: Number(year),
          date,
          swimmers: names.map((name) => ({ name: name.trim() })),
          leadoff,
          meetName: date ? record?.meetName : null,
        })
      )
    } catch (err) {
      setError(recordsErrorMessage(err, "Couldn't save the record"))
    } finally {
      setBusy(false)
    }
  }

  function confirmClear() {
    Alert.alert("Clear record?", `The record before it takes its place.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          setBusy(true)
          try {
            done(await api.clearRecord(gender, def.event))
          } catch (err) {
            setError(recordsErrorMessage(err, "Couldn't clear the record"))
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  return (
    <BottomSheet visible onClose={onClose} title={recordTitle(target)}>
      <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <TextField
              label="Time"
              placeholder="0:00.00"
              value={time}
              onChangeText={setTime}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              editable={!busy}
            />
          </View>
          <View style={styles.fieldHalf}>
            <TextField
              label="Year"
              placeholder="2026"
              value={year}
              onChangeText={(value) => setYear(value.replace(/\D/g, "").slice(0, 4))}
              keyboardType="number-pad"
              editable={!busy}
            />
          </View>
        </View>
        {names.map((name, i) => (
          <TextField
            key={i}
            label={def.relay ? `Leg ${i + 1}` : "Swimmer"}
            placeholder="First Last"
            value={name}
            onChangeText={(value) => setNames((prev) => prev.map((n, j) => (j === i ? value : n)))}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
          />
        ))}
        {!def.relay ? (
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchLabel}>Relay lead-off (R)</Text>
              <Muted>Set leading off a relay.</Muted>
            </View>
            <Switch
              value={leadoff}
              onValueChange={setLeadoff}
              disabled={busy}
              trackColor={{ false: c.switchTrack, true: c.primary }}
              thumbColor={c.switchThumb}
            />
          </View>
        ) : null}
        <Muted style={styles.hint}>Names that match the roster link to the athlete.</Muted>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Button label="Save" loading={busy} disabled={busy} onPress={save} />
          {record && isRecordEditable(record) ? (
            <Button label="Clear record" variant="danger" disabled={busy} onPress={confirmClear} />
          ) : null}
        </View>
      </ScrollView>
    </BottomSheet>
  )
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
 * An event's history and top 10 as its own sheet (tapping a record outside edit mode). Top 10 shows
 * each swimmer's best (performers) or the fastest swims (performances); relays only the latter.
 */
export function RecordHistorySheet({
  target,
  canEdit,
  onClose,
}: {
  target: Pick<RecordTarget, "def" | "gender">
  canEdit: boolean
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
        <RecordHistoryList target={target} canEdit={canEdit} onNavigate={onClose} />
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

/**
 * An event's records, newest first; staff can remove a staff-set one (the record
 * before it takes its place). Ones from imported meet results or the records sheet stay.
 */
function RecordHistoryList({
  target,
  canEdit,
  onNavigate,
}: {
  target: Pick<RecordTarget, "def" | "gender">
  canEdit: boolean
  /** Close the sheet before leaving for an athlete's profile. */
  onNavigate: () => void
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const router = useRouter()
  const queryClient = useQueryClient()
  const { def, gender } = target
  const { data, isPending, error } = useQuery({
    queryKey: ["records", "history", gender, def.event],
    queryFn: () => api.getRecordHistory(gender, def.event),
  })
  const [removeError, setRemoveError] = useState<string | null>(null)

  function confirmRemove(record: TeamRecordItem) {
    Alert.alert("Remove record?", `${formatRecordTime(record.timeMs)} · ${recordSetLabel(record)}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.removeRecord(record.id)
            setRemoveError(null)
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["records", "history", gender, def.event] }),
              queryClient.invalidateQueries({ queryKey: ["records", "top", gender, def.event] }),
              queryClient.invalidateQueries({ queryKey: ["records"], exact: true }),
            ])
          } catch (err) {
            setRemoveError(recordsErrorMessage(err, "Couldn't remove the record"))
          }
        },
      },
    ])
  }

  return (
    <ScrollView style={styles.sheetScroll}>
      {error ? <ErrorBlock message={recordsErrorMessage(error, "Couldn't load history")} /> : null}
      {removeError ? <Text style={styles.error}>{removeError}</Text> : null}
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
              <View style={styles.historySide}>
                <Text style={[styles.historyTime, record.isThisSeason && styles.thisSeason]}>
                  {formatRecordTime(record.timeMs)}
                </Text>
                {canEdit && isRecordEditable(record) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove record"
                    onPress={() => confirmRemove(record)}
                    hitSlop={8}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
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
    fieldRow: { flexDirection: "row", gap: spacing.sm },
    fieldHalf: { flex: 1 },
    switchRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between",
      paddingVertical: spacing.xs,
    },
    switchCopy: { flex: 1 },
    switchLabel: { color: c.text, fontSize: 15, fontWeight: "600" },
    hint: { marginTop: spacing.xs },
    error: { color: c.error, fontSize: 13, marginTop: spacing.xs },
    actions: { gap: spacing.xs, marginTop: spacing.md },
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
    historySide: { alignItems: "flex-end", gap: spacing.xs },
    historyTime: { color: c.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "700" },
    thisSeason: { color: c.accent, fontWeight: "800" },
    removeText: { color: c.error, fontSize: 13, fontWeight: "600" },
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

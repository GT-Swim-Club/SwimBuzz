import { useEffect, useMemo, useRef, useState } from "react"
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { useQuery } from "@tanstack/react-query"
import * as Sharing from "expo-sharing"
import { File, Paths } from "expo-file-system"
import {
  formatRecordTime,
  isStaffRole,
  recordsAsOfLabel,
  recordsExportFilename,
  recordSwimmerLabel,
  type RecordGender,
  type RecordGroup,
  type TeamRecordRow,
} from "@swimbuzz/shared"
import { ActionSheet, EmptyState, ErrorBlock, LoadingBlock, usePalette, type ActionSheetItem } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api, API_URL, getAccessToken } from "../lib/api"
import { useAuth } from "../lib/auth"
import { saveCaptureToPhotos } from "../lib/roster-summary-share"
import { Icon } from "./Icon"
import { SegmentedOption, SegmentedToggle } from "./SegmentedToggle"
import { RecordsExportCapture } from "./RecordsExportCapture"
import { RecordEditSheet, RecordHistorySheet, recordsErrorMessage, recordTitle, type RecordTarget } from "./RecordSheets"

const GENDERS = [
  { value: "F", label: "Women" },
  { value: "M", label: "Men" },
] as const

/** The records sheet laid out as a PDF by the API (like the web's Download PDF), ready for the share sheet. */
async function recordsPdfFile(): Promise<File> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}/api/records/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) throw new Error("Could not create PDF")
  const bytes = new Uint8Array(await res.arrayBuffer())
  const file = new File(Paths.cache, recordsExportFilename("pdf"))
  if (file.exists) file.delete()
  file.write(bytes)
  return file
}

/**
 * Team records (SCY) in the Nationals tab: one gender at a time, an event per row, grouped by stroke.
 * Tapping a record shows its history; staff switch on Edit to change one instead. Share saves the
 * whole sheet (both genders) to Photos or shares it as a PDF.
 */
export function RecordsSection() {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const { user } = useAuth()
  const canEdit = !!user && isStaffRole(user.role)
  const { data, isPending, error } = useQuery({ queryKey: ["records"], queryFn: () => api.getRecords() })
  const [gender, setGender] = useState<"F" | "M">("F")
  const [editing, setEditing] = useState(false)
  const [editTarget, setEditTarget] = useState<RecordTarget | null>(null)
  const [historyTarget, setHistoryTarget] = useState<RecordTarget | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState<"photos" | "pdf" | null>(null)
  const [saved, setSaved] = useState(false)
  const [asOf, setAsOf] = useState(() => recordsAsOfLabel())
  const captureRef = useRef<View>(null)
  const shareSheetDismissRef = useRef<(() => void) | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    }
  }, [])

  /**
   * Closes the share sheet and waits for it to finish dismissing — iOS won't present
   * another native sheet over a modal that's still animating closed (same as relays).
   */
  function closeShareSheetAndWait(): Promise<void> {
    setShareOpen(false)
    if (Platform.OS !== "ios") return Promise.resolve()
    return new Promise((resolve) => {
      const finish = () => {
        shareSheetDismissRef.current = null
        clearTimeout(fallback)
        resolve()
      }
      const fallback = setTimeout(finish, 600)
      shareSheetDismissRef.current = finish
    })
  }

  async function saveToPhotos() {
    setShareBusy("photos")
    try {
      if (!(await saveCaptureToPhotos(captureRef))) {
        Alert.alert("Permission needed", "Allow photo access in Settings to save the records image.")
        return
      }
      setSaved(true)
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      Alert.alert("Could not save image", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  async function sharePdf() {
    setShareBusy("pdf")
    try {
      const file = await recordsPdfFile()
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't open the share sheet.")
        return
      }
      await closeShareSheetAndWait()
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
    } catch (err) {
      Alert.alert("Could not share PDF", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  const groups = useMemo(() => {
    // The mixed relay is both teams' record, so it shows under either.
    const shown = (data?.rows ?? []).filter((row) => row.genders.includes(gender) || row.genders.includes("X"))
    return shown.reduce<Array<{ group: RecordGroup; rows: TeamRecordRow[] }>>((out, row) => {
      const last = out.at(-1)
      if (last?.group === row.group) last.rows.push(row)
      else out.push({ group: row.group, rows: [row] })
      return out
    }, [])
  }, [data, gender])

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.toggleWrap}>
          <SegmentedToggle selectedIndex={GENDERS.findIndex((g) => g.value === gender)} fill style={styles.toggle}>
            {GENDERS.map((g) => (
              <SegmentedOption
                key={g.value}
                flex
                selected={g.value === gender}
                accessibilityLabel={`${g.label}'s records`}
                onPress={() => setGender(g.value)}
              >
                <Text style={[styles.toggleText, g.value === gender && styles.toggleTextOn]}>{g.label}</Text>
              </SegmentedOption>
            ))}
          </SegmentedToggle>
        </View>
        {data && !editing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share records"
            hitSlop={6}
            onPress={() => {
              setAsOf(recordsAsOfLabel())
              setShareOpen(true)
            }}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          >
            <Icon name="share" size={18} color={c.textSecondary} />
          </Pressable>
        ) : null}
        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? "Done editing" : "Edit records"}
            accessibilityState={{ selected: editing }}
            hitSlop={6}
            onPress={() => setEditing((value) => !value)}
            style={({ pressed }) => [styles.editButton, editing && styles.editButtonOn, pressed && styles.pressed]}
          >
            <Icon name={editing ? "check" : "pencil"} size={18} color={editing ? c.primaryContrast : c.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {editing ? <Text style={styles.editHint}>Tap a record to change it.</Text> : null}

      {error ? <ErrorBlock message={recordsErrorMessage(error, "Couldn't load records")} /> : null}
      {isPending ? (
        <View style={styles.card}>
          <LoadingBlock />
        </View>
      ) : null}
      {data && groups.length === 0 ? <EmptyState title="No records yet" /> : null}

      {groups.map(({ group, rows }) => (
        <View key={group} style={styles.group}>
          <Text style={styles.groupTitle}>{group.toUpperCase()}</Text>
          <View style={styles.card}>
            {rows.map((row, index) => {
              const recordGender: RecordGender = row.genders.includes("X") ? "X" : gender
              const record = row.records[recordGender]
              const target: RecordTarget = { def: row, gender: recordGender, record }
              const season = record?.isThisSeason ? styles.thisSeason : null
              return (
                <Pressable
                  key={`${row.genders.join("")}|${row.event}`}
                  accessibilityRole="button"
                  accessibilityLabel={editing ? `Edit ${recordTitle(target)}` : `${recordTitle(target)} history`}
                  onPress={() => (editing ? setEditTarget(target) : setHistoryTarget(target))}
                  style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.event}>{row.label}</Text>
                    {record ? (
                      record.swimmers.map((swimmer, i) => (
                        <Text key={i} numberOfLines={1} style={[styles.name, season]}>
                          {recordSwimmerLabel(record, swimmer)}
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.empty}>No record</Text>
                    )}
                  </View>
                  <View style={styles.rowSide}>
                    <Text style={[styles.time, season]}>{record ? formatRecordTime(record.timeMs) : "—"}</Text>
                    {record ? <Text style={[styles.year, season]}>{record.year}</Text> : null}
                  </View>
                  {editing ? <Text style={styles.chevron}>›</Text> : null}
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}

      <ActionSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onDismiss={() => shareSheetDismissRef.current?.()}
        title="Share records"
        groups={[
          [
            {
              key: "photos",
              label: saved ? "Saved to Photos" : "Save to Photos",
              icon: <Icon name={saved ? "check" : "image"} size={20} color={c.text} />,
              busy: shareBusy === "photos",
              disabled: Boolean(shareBusy) && shareBusy !== "photos",
              onPress: () => void saveToPhotos(),
            },
            {
              key: "pdf",
              label: "Share PDF",
              icon: <Icon name="fileText" size={20} color={c.text} />,
              busy: shareBusy === "pdf",
              disabled: Boolean(shareBusy) && shareBusy !== "pdf",
              onPress: () => void sharePdf(),
            },
          ] satisfies ActionSheetItem[],
        ]}
      />

      {/* Off-screen sheet captured to PNG — never shown in the layout. */}
      {data && shareOpen ? (
        <View pointerEvents="none" style={styles.offscreen}>
          <RecordsExportCapture ref={captureRef} rows={data.rows} asOf={asOf} />
        </View>
      ) : null}

      {editTarget ? <RecordEditSheet target={editTarget} onClose={() => setEditTarget(null)} /> : null}
      {historyTarget ? (
        <RecordHistorySheet target={historyTarget} canEdit={canEdit} onClose={() => setHistoryTarget(null)} />
      ) : null}
    </View>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    toggleWrap: { flex: 1, minWidth: 0 },
    toggle: { alignSelf: "stretch" },
    editButton: {
      alignItems: "center",
      borderRadius: radii.md,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    editButtonOn: { backgroundColor: c.primary },
    editHint: { color: c.textTertiary, fontSize: 12, marginBottom: spacing.sm, marginTop: -spacing.xs },
    pressed: { opacity: 0.72 },
    toggleText: { color: c.textSecondary, fontSize: 14, fontWeight: "700" },
    toggleTextOn: { color: c.primaryContrast },
    group: { marginBottom: spacing.md },
    groupTitle: {
      color: c.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    card: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 56,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    rowDivider: { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth },
    rowPressed: { backgroundColor: c.bgHover },
    rowMain: { flex: 1, gap: 1, minWidth: 0 },
    event: { color: c.text, fontSize: 15, fontWeight: "700", marginBottom: 1 },
    name: { color: c.textSecondary, fontSize: 13 },
    empty: { color: c.textTertiary, fontSize: 13 },
    rowSide: { alignItems: "flex-end", gap: 2 },
    time: { color: c.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "700" },
    year: { color: c.textSecondary, fontSize: 13, fontVariant: ["tabular-nums"] },
    thisSeason: { color: c.accent, fontWeight: "800" },
    offscreen: { position: "absolute", top: 0, left: -10000 },
    chevron: { color: c.textTertiary, fontSize: 25, fontWeight: "300" },
  })
}

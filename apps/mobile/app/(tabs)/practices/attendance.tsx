import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Platform, Pressable, RefreshControl, Text, TextInput, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Svg, { Path } from "react-native-svg"
import {
  clearanceFlagDetail,
  DEFAULT_TIME_ZONE,
  formatClockTime,
  formatFullDate,
  isStaffRole,
  type ClearanceCheck,
  type PracticeAttendanceRecord,
  type PracticeCheckInInput,
  type PracticeAttendanceResponse,
} from "@swimbuzz/shared"
import {
  Button,
  ErrorBlock,
  Muted,
  Screen,
  ScrollView,
  Skeleton,
  SubtitleSegments,
  TextField,
  Title,
  usePalette,
} from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { Icon } from "../../../src/components/Icon"
import { ClearanceBadge } from "../../../src/components/ClearanceBadge"
import { RelativeDateText } from "../../../src/components/RelativeDateText"
import { ZonedTimeText } from "../../../src/components/ZonedTimeText"
import { StaffBadge } from "../../../src/components/StaffBadge"
/**
 * Practice attendance, mirroring the web attendance page. Staff check athletes in
 * by Buzzcard (a card reader paired as a keyboard types the GTID + Enter into the
 * scan field — or type the GTID by hand) or by name, remove check-ins, and see who
 * isn't cleared (physical / concussion test). Athletes see the read-only list.
 */

type RosterEntry = {
  id: string
  slug: string | null
  name: string
  preferredName: string | null
  gender: "M" | "F"
  uncleared: ClearanceCheck[]
}

type Feedback =
  | { kind: "added"; name: string; via: "SCAN" | "MANUAL"; uncleared: ClearanceCheck[] }
  | { kind: "duplicate"; name: string; uncleared: ClearanceCheck[] }
  | { kind: "error"; message: string }

const FEEDBACK_MS = 4000

function WarningIcon({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 9v4M12 17h.01" stroke={color} strokeWidth={2.25} strokeLinecap="round" />
    </Svg>
  )
}

function checkInTime(iso: string) {
  return formatClockTime(new Date(iso))
}

export default function PracticeAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const c = usePalette()
  const warnText = c.warningText
  const tabBarPad = useTabBarScrollPadding()
  const queryClient = useQueryClient()

  const { data: practice, error: practiceError } = useQuery({
    queryKey: ["practice", id],
    queryFn: () => api.getPractice(id as string),
    enabled: Boolean(id),
  })
  // Opened by slug: every attendance call is keyed on the practice id.
  const practiceId = typeof practice?.id === "string" ? practice.id : null
  const attendanceKey = useMemo(() => ["practice-attendance", practiceId] as const, [practiceId])

  const {
    data,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: attendanceKey,
    queryFn: () => api.getPracticeAttendance(practiceId as string),
    enabled: Boolean(practiceId),
  })
  const attendance = useMemo(() => data?.attendance ?? [], [data])
  const season = data?.season ?? null

  // Check-in by name searches the season roster (with clearance), falling back to everyone.
  const { data: seasonRoster } = useQuery({
    queryKey: ["clearance", season],
    queryFn: () => api.listClearance(season as string),
    enabled: isStaff && Boolean(season),
  })
  const { data: allAthletes } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.listAthletes(),
    enabled: isStaff && seasonRoster != null && seasonRoster.athletes.length === 0,
  })
  const email = user?.email?.trim().toLowerCase() ?? null
  const { data: athletesForViewer } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.listAthletes(),
    enabled: !isStaff && Boolean(email),
  })
  const viewerAthleteId = useMemo(
    () =>
      email
        ? (athletesForViewer ?? []).find((a) => a.user?.email?.trim().toLowerCase() === email)?.id ?? null
        : null,
    [athletesForViewer, email]
  )

  const roster = useMemo<RosterEntry[]>(() => {
    if (seasonRoster && seasonRoster.athletes.length > 0) {
      return seasonRoster.athletes.map((a) => ({
        id: a.athleteId,
        slug: a.slug,
        name: `${a.firstName} ${a.lastName}`.trim(),
        preferredName: a.preferredName,
        gender: a.gender,
        uncleared: [
          ...(a.physical.cleared ? [] : (["physical"] as const)),
          ...(a.concussion.cleared ? [] : (["concussion"] as const)),
        ],
      }))
    }
    return (allAthletes ?? []).map((a) => ({
      id: a.id,
      slug: a.slug ?? null,
      name: `${a.firstName} ${a.lastName}`.trim(),
      preferredName: a.preferredName,
      gender: a.gender,
      uncleared: [],
    }))
  }, [seasonRoster, allAthletes])

  const [recording, setRecording] = useState(false)
  const [scanValue, setScanValue] = useState("")
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Scans arrive faster than a round trip; chain them so none are dropped.
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const scanInputRef = useRef<TextInput>(null)

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
  }, [])

  const showFeedback = useCallback((next: Feedback) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback(next)
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }, [])

  const setRecords = useCallback(
    (update: (records: PracticeAttendanceRecord[]) => PracticeAttendanceRecord[]) => {
      queryClient.setQueryData(attendanceKey, (old: PracticeAttendanceResponse | undefined) =>
        old ? { ...old, attendance: update(old.attendance) } : old
      )
    },
    [queryClient, attendanceKey]
  )

  const checkIn = useCallback(
    (payload: PracticeCheckInInput, optimistic?: PracticeAttendanceRecord) => {
      if (!practiceId) return
      // By name we already know who it is, so show them at once (like web); a scan waits for the server.
      if (optimistic) setRecords((records) => [optimistic, ...records])
      const tempId = optimistic?.id
      queueRef.current = queueRef.current.then(async () => {
        setPending(true)
        try {
          const res = await api.checkInPracticeAttendance(practiceId, payload)
          const record = res.record
          setRecords((records) => {
            const withoutTemp = tempId ? records.filter((r) => r.id !== tempId) : records
            if (res.duplicate) {
              return withoutTemp.some((r) => r.athleteId === record.athleteId) ? withoutTemp : [record, ...withoutTemp]
            }
            return [record, ...withoutTemp.filter((r) => r.id !== record.id)]
          })
          showFeedback(
            res.duplicate
              ? { kind: "duplicate", name: record.name, uncleared: record.uncleared ?? [] }
              : { kind: "added", name: record.name, via: record.method, uncleared: record.uncleared ?? [] }
          )
        } catch (err) {
          if (tempId) setRecords((records) => records.filter((r) => r.id !== tempId))
          showFeedback({
            kind: "error",
            message: err instanceof Error ? err.message : "Something went wrong. Try that scan again.",
          })
        } finally {
          setPending(false)
        }
      })
    },
    [practiceId, setRecords, showFeedback]
  )

  async function removeAttendee(record: PracticeAttendanceRecord, index: number) {
    if (!practiceId) return
    setRecords((records) => records.filter((r) => r.id !== record.id))
    try {
      await api.removePracticeAttendance(practiceId, record.athleteId)
    } catch {
      setRecords((records) => {
        if (records.some((r) => r.id === record.id)) return records
        const restored = [...records]
        restored.splice(Math.min(index, restored.length), 0, record)
        return restored
      })
      showFeedback({ kind: "error", message: `Could not remove ${record.name}.` })
    }
  }

  function submitScan() {
    const value = scanValue.trim()
    setScanValue("")
    if (value) checkIn({ gtid: value })
    // Keep the field focused so the next card can be scanned straight away.
    scanInputRef.current?.focus()
  }

  const attendedIds = useMemo(() => new Set(attendance.map((r) => r.athleteId)), [attendance])
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return roster
      .filter((entry) => !attendedIds.has(entry.id))
      .filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) || !!entry.preferredName?.toLowerCase().includes(needle)
      )
      .slice(0, 6)
  }, [query, roster, attendedIds])

  if (!id) {
    return (
      <Screen>
        <ErrorBlock message="Not found" />
      </Screen>
    )
  }

  const loadError = practiceError ?? error
  if (loadError && !data) {
    return (
      <Screen>
        <ErrorBlock message={loadError instanceof Error ? loadError.message : "Failed to load attendance"} />
      </Screen>
    )
  }

  if (!practice || !data) return <AttendanceSkeleton isStaff={isStaff} />

  const timeZone = String(practice.timeZone ?? DEFAULT_TIME_ZONE)
  const scannedCount = attendance.filter((r) => r.method === "SCAN").length
  const unclearedCount = isStaff ? attendance.filter((r) => (r.uncleared?.length ?? 0) > 0).length : 0
  const feedbackUncleared =
    feedback && feedback.kind !== "error" ? clearanceFlagDetail(feedback.uncleared) : null
  const styles = makeStyles(c)

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarPad }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} />}
      >
        <Title>{String(practice.title ?? "Practice")}</Title>
        <Text style={styles.eyebrow}>ATTENDANCE</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: spacing.md }}>
          <SubtitleSegments
            textStyle={{ fontSize: 14, color: c.textSecondary }}
            segments={[
              practice.startsAt ? (
                <RelativeDateText
                  value={String(practice.startsAt)}
                  kind="event"
                  timeZone={timeZone}
                  absolute={formatFullDate(String(practice.startsAt), timeZone)}
                  style={{ fontSize: 14, color: c.textSecondary }}
                />
              ) : null,
              practice.startsAt ? (
                <ZonedTimeText
                  startsAt={String(practice.startsAt)}
                  endsAt={practice.endsAt ? String(practice.endsAt) : null}
                  timeZone={timeZone}
                  style={{ fontSize: 14, color: c.textSecondary }}
                />
              ) : null,
              practice.location ? String(practice.location) : null,
            ]}
          />
        </View>

        {isStaff ? (
          <View style={[styles.card, recording && { borderColor: c.primary }]}>
            {recording ? (
              <>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Recording attendance</Text>
                    <Muted>Scan a Buzzcard, or type a GTID and press return.</Muted>
                  </View>
                </View>
                <TextInput
                  ref={scanInputRef}
                  value={scanValue}
                  onChangeText={setScanValue}
                  onSubmitEditing={submitScan}
                  submitBehavior="submit"
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="none"
                  spellCheck={false}
                  keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "number-pad"}
                  returnKeyType="done"
                  placeholder="Waiting for a Buzzcard scan…"
                  placeholderTextColor={c.textTertiary}
                  accessibilityLabel="Buzzcard scan or GTID"
                  style={styles.scanInput}
                />
                {pending ? <Muted style={{ textAlign: "center" }}>Saving check-in…</Muted> : null}
                <Button label="Stop recording" variant="secondary" onPress={() => setRecording(false)} />
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Buzzcard check-in</Text>
                <Muted style={{ marginBottom: spacing.sm }}>
                  Start recording, then scan each athlete’s Buzzcard as they arrive (a card reader paired to
                  this device as a keyboard), or type their GTID.
                </Muted>
                <Button
                  label="Start recording"
                  onPress={() => {
                    setRecording(true)
                    setFeedback(null)
                    setScanValue("")
                  }}
                />
              </>
            )}

            {feedback ? (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.banner,
                  feedback.kind === "added"
                    ? { borderColor: c.primaryBorderHover, backgroundColor: c.primaryBg }
                    : feedback.kind === "duplicate"
                      ? { borderColor: c.warningBorder, backgroundColor: c.warningBg }
                      : { borderColor: c.errorBorder, backgroundColor: c.errorBg },
                ]}
              >
                {feedback.kind === "added" ? (
                  <Icon name="check" size={16} color={c.accent} />
                ) : null}
                <Text
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: feedback.kind === "added" ? c.accent : feedback.kind === "duplicate" ? warnText : c.error,
                  }}
                >
                  {feedback.kind === "error" ? (
                    feedback.message
                  ) : (
                    <>
                      <Text style={{ fontWeight: "600" }}>{feedback.name}</Text>
                      {feedback.kind === "added"
                        ? ` checked in${feedback.via === "MANUAL" ? " by name" : ""}.`
                        : " is already checked in."}
                    </>
                  )}
                </Text>
              </View>
            ) : null}
            {feedback && feedback.kind !== "error" && feedbackUncleared ? (
              <View
                accessibilityRole="alert"
                style={[styles.banner, { borderColor: c.warningBorder, backgroundColor: c.warningBg }]}
              >
                <WarningIcon size={16} color={warnText} />
                <Text style={{ flex: 1, fontSize: 14, color: warnText }}>
                  <Text style={{ fontWeight: "600" }}>{feedbackUncleared}</Text> for {feedback.name} — checked in, but
                  not cleared to practice.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>CHECKED IN ({attendance.length})</Text>
            {isStaff && scannedCount > 0 ? (
              <Text style={styles.meta}>
                {scannedCount} scanned · {attendance.length - scannedCount} by name
              </Text>
            ) : null}
          </View>
          {unclearedCount > 0 ? (
            <View style={styles.unclearedRow}>
              <WarningIcon size={14} color={warnText} />
              <Text style={[styles.meta, { flexShrink: 1, color: c.textSecondary }]}>
                {unclearedCount} checked in {unclearedCount === 1 ? "isn't" : "aren't"} cleared (physical or
                concussion test).{" "}
                <Text
                  accessibilityRole="link"
                  onPress={() =>
                    router.push(
                      season ? `/roster/clearance?season=${encodeURIComponent(season)}` : "/roster/clearance"
                    )
                  }
                  style={{ fontWeight: "600", color: c.text }}
                >
                  Clearance list
                </Text>
              </Text>
            </View>
          ) : null}

          {isStaff ? (
            <View>
              <TextField
                label="Check in by name"
                placeholder="Search the roster…"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {matches.length > 0 ? (
                <View style={styles.matches}>
                  {matches.map((entry, i) => (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Check in ${entry.name}`}
                      onPress={() => {
                        setQuery("")
                        checkIn(
                          { athleteId: entry.id },
                          {
                            id: `pending-${entry.id}-${Date.now()}`,
                            athleteId: entry.id,
                            athleteSlug: entry.slug,
                            name: entry.name,
                            gender: entry.gender,
                            year: null,
                            method: "MANUAL",
                            recordedAt: new Date().toISOString(),
                            staffTitle: null,
                            uncleared: entry.uncleared,
                          }
                        )
                      }}
                      style={({ pressed }) => [
                        styles.matchRow,
                        i > 0 && { borderTopWidth: 1, borderTopColor: c.borderSecondary },
                        pressed && { backgroundColor: c.bgHover },
                      ]}
                    >
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, color: c.text }}>
                          {entry.name}
                        </Text>
                        <ClearanceBadge missing={entry.uncleared} />
                      </View>
                      <Icon name="check" size={16} color={c.textTertiary} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {attendance.length === 0 ? (
            <View style={styles.empty}>
              <Muted style={{ textAlign: "center" }}>
                No one has checked in yet.{isStaff && !recording ? " Start recording to scan Buzzcards." : ""}
              </Muted>
            </View>
          ) : (
            <View style={{ gap: spacing.xs }}>
              {attendance.map((record, index) => {
                const isYou = !isStaff && record.athleteId === viewerAthleteId
                return (
                  <Pressable
                    key={record.id}
                    onPress={() => router.push(`/roster/${record.athleteId}`)}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.bgHover }]}
                  >
                    <Text style={styles.rowNumber}>{attendance.length - index}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs }}>
                        <Text numberOfLines={1} style={styles.rowName}>
                          {record.name}
                        </Text>
                        {isYou ? (
                          <View style={styles.youPill}>
                            <Text style={styles.youPillText}>You</Text>
                          </View>
                        ) : null}
                        {record.staffTitle ? <StaffBadge title={record.staffTitle} /> : null}
                        {isStaff ? <ClearanceBadge missing={record.uncleared} /> : null}
                      </View>
                      <Text style={styles.meta}>
                        {checkInTime(record.recordedAt)}
                        {isStaff ? (record.method === "MANUAL" ? " · added by name" : " · Buzzcard") : ""}
                        {record.year ? ` · ${record.year}` : ""}
                      </Text>
                    </View>
                    {isStaff ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${record.name} from attendance`}
                        hitSlop={8}
                        disabled={record.id.startsWith("pending-")}
                        onPress={() => void removeAttendee(record, index)}
                        style={({ pressed }) => [styles.removeButton, pressed && { backgroundColor: c.errorBg }]}
                      >
                        <Icon name="x" size={16} color={c.textTertiary} />
                      </Pressable>
                    ) : record.method === "SCAN" ? (
                      <Icon name="idCard" size={16} color={c.textTertiary} accessibilityLabel="Buzzcard" />
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

/** Mirrors the screen: title, eyebrow, subtitle, (staff) scan card, then the checked-in list. */
function AttendanceSkeleton({ isStaff }: { isStaff: boolean }) {
  const c = usePalette()
  const styles = makeStyles(c)
  return (
    <Screen>
      <View accessibilityLabel="Loading attendance" style={{ gap: spacing.xs, marginBottom: spacing.md }}>
        <Skeleton style={{ height: 28, width: "70%" }} />
        <Skeleton style={{ height: 12, width: 90 }} />
        <Skeleton style={{ height: 14, width: "55%" }} />
      </View>
      {isStaff ? (
        <View style={[styles.card, { gap: spacing.sm }]}>
          <Skeleton style={{ height: 16, width: 140 }} />
          <Skeleton style={{ height: 14, width: "90%" }} />
          <Skeleton style={{ height: 44, width: "100%", borderRadius: radii.md }} />
        </View>
      ) : null}
      <View style={[styles.card, { gap: spacing.sm }]}>
        <Skeleton style={{ height: 14, width: 120 }} />
        {isStaff ? <Skeleton style={{ height: 44, width: "100%", borderRadius: radii.md }} /> : null}
        {[...Array(5)].map((_, i) => (
          <View key={i} style={[styles.row, { gap: spacing.sm }]}>
            <Skeleton style={{ height: 12, width: 16 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton style={{ height: 15, width: "60%" }} />
              <Skeleton style={{ height: 12, width: "40%" }} />
            </View>
          </View>
        ))}
      </View>
    </Screen>
  )
}

function makeStyles(c: ColorPalette) {
  return {
    eyebrow: {
      marginTop: 2,
      marginBottom: spacing.xs,
      fontSize: 13,
      fontWeight: "600" as const,
      letterSpacing: 2,
      color: c.accent,
    },
    card: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.lg + 6,
      backgroundColor: c.bgContainer,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    cardHeader: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "baseline" as const,
      justifyContent: "space-between" as const,
      gap: spacing.xs,
    },
    cardTitle: { fontSize: 16, fontWeight: "600" as const, color: c.text },
    sectionLabel: { fontSize: 14, fontWeight: "600" as const, letterSpacing: 0.6, color: c.textSecondary },
    meta: { fontSize: 12, color: c.textTertiary },
    unclearedRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 6 },
    scanInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.lg,
      backgroundColor: c.fillSecondary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 18,
      // No letterSpacing on text inputs: iOS reuses native text fields across
      // screens and the spacing sticks, stretching later placeholders.
      textAlign: "center" as const,
      color: c.text,
    },
    banner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: spacing.xs,
      borderWidth: 1,
      borderRadius: radii.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    matches: {
      marginTop: -spacing.xs,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      backgroundColor: c.bgElevated,
      overflow: "hidden" as const,
    },
    matchRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
    },
    empty: {
      borderWidth: 1,
      borderStyle: "dashed" as const,
      borderColor: c.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
    },
    rowNumber: { width: 24, textAlign: "right" as const, fontSize: 12, color: c.textTertiary },
    rowName: { flexShrink: 1, fontSize: 15, fontWeight: "600" as const, color: c.text },
    youPill: { backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
    youPillText: { fontSize: 11, fontWeight: "700" as const, color: c.primaryContrast },
    removeButton: {
      width: 32,
      height: 32,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: radii.sm,
    },
  }
}

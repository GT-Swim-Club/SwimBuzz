import { useCallback, useMemo, useState } from "react"
import { Alert, View } from "react-native"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import {
  athleteDisplayName,
  formatTime,
  isStaffRole,
  type StaffTitle,
} from "@swimbuzz/shared"
import { StaffBadge } from "../../../src/components/StaffBadge"
import {
  Body,
  Button,
  Chip,
  ErrorBlock,
  ListRow,
  LoadingBlock,
  MetaRow,
  Muted,
  Screen,
  ScrollView,
  Section,
  TextField,
  Title,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { DateSelector } from "../../../src/components/DateTimeSelector"
import { useAuth } from "../../../src/lib/auth"

type SwimRow = {
  id?: string
  event?: string
  course?: string
  timeMs?: number
  date?: string
  meet?: string
  meetRef?: { id?: string; name?: string; slug?: string; season?: string } | null
}

const COURSES = ["SCY", "LCM", "SCM"] as const

function genderLabel(gender: unknown) {
  if (gender === "F") return "Women"
  if (gender === "M") return "Men"
  return gender ? String(gender) : null
}

/** Convert "1:23.45" / "58.32" / raw ms to milliseconds. */
function parseTimeMs(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed)
    return Number.isFinite(ms) && ms > 0 ? ms : null
  }
  const parts = trimmed.split(":")
  let ms: number
  if (parts.length === 2) {
    ms = (parseInt(parts[0], 10) * 60 + parseFloat(parts[1])) * 1000
  } else {
    ms = parseFloat(parts[0]) * 1000
  }
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null
}

function formatPending(pending: Record<string, unknown>): string {
  const parts: string[] = []
  if (pending.swimCloudId !== undefined) {
    parts.push(`SwimCloud ID → ${String(pending.swimCloudId)}`)
  }
  if (Array.isArray(pending.nicknames)) {
    parts.push(`Nicknames → ${(pending.nicknames as string[]).join(", ") || "(none)"}`)
  }
  return parts.join(" · ") || "Pending profile changes"
}

export default function AthleteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const tabBarPad = useTabBarScrollPadding()
  const [athlete, setAthlete] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [resolvingPending, setResolvingPending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [swimEvent, setSwimEvent] = useState("")
  const [swimCourse, setSwimCourse] = useState<(typeof COURSES)[number]>("SCY")
  const [swimTime, setSwimTime] = useState("")
  const [swimDate, setSwimDate] = useState("")
  const [addingSwim, setAddingSwim] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }
    setError(null)
    try {
      const data = await api.getAthlete(id)
      setAthlete(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load athlete")
      setAthlete(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const swims = useMemo(() => {
    if (!athlete || !Array.isArray(athlete.swims)) return [] as SwimRow[]
    return athlete.swims as SwimRow[]
  }, [athlete])

  const personalBests = useMemo(() => {
    const best = new Map<string, SwimRow>()
    for (const swim of swims) {
      const event = String(swim.event ?? "")
      const course = String(swim.course ?? "")
      if (!event || !course || typeof swim.timeMs !== "number") continue
      const key = `${event}·${course}`
      const prev = best.get(key)
      if (!prev || (prev.timeMs ?? Infinity) > swim.timeMs) {
        best.set(key, swim)
      }
    }
    return Array.from(best.values()).sort((a, b) => {
      const ae = String(a.event ?? "")
      const be = String(b.event ?? "")
      if (ae !== be) return ae.localeCompare(be)
      return String(a.course ?? "").localeCompare(String(b.course ?? ""))
    })
  }, [swims])

  const highlightBest = useMemo(() => {
    let best: SwimRow | null = null
    for (const swim of personalBests) {
      if (typeof swim.timeMs !== "number") continue
      if (!best || (best.timeMs ?? Infinity) > swim.timeMs) {
        best = swim
      }
    }
    return best
  }, [personalBests])

  if (loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    )
  }

  if (!athlete) {
    return (
      <Screen>
        <ErrorBlock message={error ?? "Not found"} />
      </Screen>
    )
  }

  const name = athleteDisplayName({
    firstName: String(athlete.firstName ?? ""),
    lastName: String(athlete.lastName ?? ""),
    nicknames: Array.isArray(athlete.nicknames)
      ? (athlete.nicknames as string[])
      : [],
  })
  const seasons = Array.isArray(athlete.seasons)
    ? (athlete.seasons as string[])
    : []
  const isOwn =
    !!user &&
    typeof athlete.userId === "string" &&
    athlete.userId === user.id
  const isStaff = !!user && isStaffRole(user.role)
  const canManage = isOwn || isStaff
  const swimCloudId =
    athlete.swimCloudId != null && athlete.swimCloudId !== ""
      ? String(athlete.swimCloudId)
      : null
  const pending =
    athlete.pendingProfileChanges &&
    typeof athlete.pendingProfileChanges === "object"
      ? (athlete.pendingProfileChanges as Record<string, unknown>)
      : null

  async function requestImport() {
    if (!id) return
    setImporting(true)
    try {
      await api.requestTimesImport(id)
      Alert.alert("Requested", "Times import request sent to coaches.")
    } catch (err) {
      Alert.alert(
        "Could not request import",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setImporting(false)
    }
  }

  async function resolvePending(approve: boolean) {
    if (!id) return
    setResolvingPending(true)
    try {
      await api.updateAthlete(id, {
        ...(approve
          ? { approvePendingProfileChanges: true }
          : { rejectPendingProfileChanges: true }),
      })
      await load()
      Alert.alert(
        approve ? "Approved" : "Rejected",
        approve
          ? "Pending profile changes were applied."
          : "Pending profile changes were discarded."
      )
    } catch (err) {
      Alert.alert(
        "Could not update",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setResolvingPending(false)
    }
  }

  async function addSwim() {
    if (!id) return
    const event = swimEvent.trim()
    const timeMs = parseTimeMs(swimTime)
    const date = swimDate.trim()
    if (!event || !timeMs || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert(
        "Missing fields",
        "Enter event, a valid time (e.g. 1:23.45 or ms), and date (YYYY-MM-DD)."
      )
      return
    }
    setAddingSwim(true)
    try {
      await api.createSwim({
        athleteId: id,
        event,
        course: swimCourse,
        timeMs,
        date,
        source: "manual",
      })
      setSwimEvent("")
      setSwimTime("")
      setSwimDate("")
      await load()
      Alert.alert("Saved", "Swim added.")
    } catch (err) {
      Alert.alert(
        "Could not add swim",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setAddingSwim(false)
    }
  }

  function confirmDeleteAthlete() {
    if (!id) return
    Alert.alert(
      "Delete athlete?",
      "This permanently removes the athlete and their swims.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteAthlete(),
        },
      ]
    )
  }

  async function deleteAthlete() {
    if (!id) return
    setDeleting(true)
    try {
      await api.deleteAthlete(id)
      router.replace("/roster")
    } catch (err) {
      Alert.alert(
        "Could not delete athlete",
        err instanceof Error ? err.message : "Something went wrong"
      )
      setDeleting(false)
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPad }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Title>{name}</Title>
          {(athlete.user as { staffTitle?: StaffTitle | null } | undefined)?.staffTitle ? (
            <StaffBadge
              title={(athlete.user as { staffTitle: StaffTitle }).staffTitle}
            />
          ) : null}
        </View>
        <Muted style={{ marginBottom: spacing.md }}>
          {[genderLabel(athlete.gender), ...seasons].filter(Boolean).join(" · ")}
        </Muted>

        {error ? <ErrorBlock message={error} /> : null}

        <Section title="Profile">
          {athlete.year ? (
            <MetaRow label="Year" value={String(athlete.year)} />
          ) : null}
          {athlete.gender ? (
            <MetaRow label="Gender" value={genderLabel(athlete.gender) ?? ""} />
          ) : null}
          {seasons.length > 0 ? (
            <MetaRow label="Seasons" value={seasons.join(", ")} />
          ) : null}
          {canManage && swimCloudId ? (
            <MetaRow label="SwimCloud ID" value={swimCloudId} />
          ) : null}
        </Section>

        {swims.length > 0 ? (
          <Section title="Highlights">
            <MetaRow label="Personal bests" value={String(personalBests.length)} />
            <MetaRow label="Career swims" value={String(swims.length)} />
            {highlightBest && typeof highlightBest.timeMs === "number" ? (
              <MetaRow
                label="Fastest PB"
                value={`${formatTime(highlightBest.timeMs)} · ${highlightBest.event ?? "Event"} ${highlightBest.course ?? ""}`.trim()}
              />
            ) : null}
          </Section>
        ) : null}

        {isStaff && pending ? (
          <Section title="Pending profile changes">
            <Body style={{ marginBottom: spacing.sm }}>
              {formatPending(pending)}
            </Body>
            <View style={{ gap: spacing.sm }}>
              <Button
                label="Approve changes"
                loading={resolvingPending}
                onPress={() => void resolvePending(true)}
              />
              <Button
                label="Reject changes"
                variant="danger"
                loading={resolvingPending}
                onPress={() => void resolvePending(false)}
              />
            </View>
          </Section>
        ) : null}

        {canManage ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Button
              label="Request times import"
              variant="secondary"
              loading={importing}
              onPress={() => void requestImport()}
            />
          </View>
        ) : null}

        {isStaff ? (
          <Section title="Add swim">
            <TextField
              label="Event"
              value={swimEvent}
              onChangeText={setSwimEvent}
              placeholder="100 Free"
            />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginBottom: spacing.sm,
              }}
            >
              {COURSES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  selected={swimCourse === c}
                  onPress={() => setSwimCourse(c)}
                />
              ))}
            </View>
            <TextField
              label="Time"
              value={swimTime}
              onChangeText={setSwimTime}
              placeholder="1:23.45 or milliseconds"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <DateSelector
              label="Date"
              value={swimDate}
              onChange={setSwimDate}
              placeholder="Select a date"
              optional
            />
            <Button
              label="Add swim"
              loading={addingSwim}
              onPress={() => void addSwim()}
            />
          </Section>
        ) : null}

        <Section title="Personal bests">
          {personalBests.length === 0 ? (
            <Muted>No times yet.</Muted>
          ) : (
            personalBests.map((swim) => (
              <ListRow
                key={`${swim.event}-${swim.course}-${swim.timeMs}`}
                title={`${swim.event} · ${swim.course}`}
                subtitle={formatTime(swim.timeMs as number)}
              />
            ))
          )}
        </Section>

        <Section title="Swim history">
          {swims.length === 0 ? (
            <Muted>No swim history.</Muted>
          ) : (
            swims.map((swim, index) => {
              const meetName =
                swim.meetRef?.name ||
                (swim.meet ? String(swim.meet) : null) ||
                "Meet"
              const dateLabel = swim.date
                ? new Date(String(swim.date)).toLocaleDateString()
                : "—"
              const timeLabel =
                typeof swim.timeMs === "number" ? formatTime(swim.timeMs) : "—"
              return (
                <ListRow
                  key={swim.id ?? `${index}-${swim.event}-${swim.timeMs}`}
                  title={`${dateLabel} · ${swim.event ?? "Event"}`}
                  subtitle={[swim.course, timeLabel, meetName]
                    .filter(Boolean)
                    .join(" · ")}
                />
              )
            })
          )}
        </Section>

        {athlete.user && typeof athlete.user === "object" ? (
          <Section title="Account">
            <Body>
              {String(
                (athlete.user as { name?: string | null }).name ??
                  (athlete.user as { email?: string | null }).email ??
                  "Linked account"
              )}
            </Body>
          </Section>
        ) : null}

        {isStaff ? (
          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="Delete athlete"
              variant="danger"
              loading={deleting}
              onPress={confirmDeleteAthlete}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

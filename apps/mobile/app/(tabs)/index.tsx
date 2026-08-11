import { useCallback, useMemo, useState } from "react"
import { Redirect, useFocusEffect, useRouter } from "expo-router"
import { ScrollView, View } from "react-native"
import type { MeetSummary, PracticeSummary } from "@swimbuzz/shared"
import { formatMeetDateRange, formatRoleLabel } from "@swimbuzz/shared"
import {
  Body,
  Button,
  ErrorBlock,
  ListRow,
  LoadingBlock,
  Muted,
  Screen,
  Section,
  Title,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../../src/lib/api"
import { useAuth } from "../../src/lib/auth"

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function toIsoDate(value: string | null | undefined) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function formatPracticeDate(date: string | null | undefined) {
  const iso = toIsoDate(date)
  if (!iso) return null
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export default function HomeScreen() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [meets, setMeets] = useState<MeetSummary[]>([])
  const [practices, setPractices] = useState<PracticeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [meetList, practiceList] = await Promise.all([
        api.listMeets(),
        api.listPractices(),
      ])
      setMeets(meetList)
      setPractices(practiceList)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load home")
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!user) return
      void load()
    }, [load, user])
  )

  const nextMeet = useMemo(() => {
    const today = todayIsoDate()
    return meets
      .filter((meet) => {
        const start = toIsoDate(meet.startDate)
        return start != null && start >= today
      })
      .sort((a, b) => {
        const aDate = toIsoDate(a.startDate) ?? ""
        const bDate = toIsoDate(b.startDate) ?? ""
        return aDate.localeCompare(bDate)
      })[0]
  }, [meets])

  const nextPractice = useMemo(() => {
    const today = todayIsoDate()
    return practices
      .filter((practice) => {
        const date = toIsoDate(practice.date)
        return date != null && date >= today
      })
      .sort((a, b) => {
        const aDate = toIsoDate(a.date) ?? ""
        const bDate = toIsoDate(b.date) ?? ""
        if (aDate !== bDate) return aDate.localeCompare(bDate)
        return String(a.startTime).localeCompare(String(b.startTime))
      })[0]
  }, [practices])

  if (!authLoading && !user) return <Redirect href="/sign-in" />
  if (!user) return null

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Title>Welcome</Title>
        <Body style={{ marginBottom: spacing.lg }}>
          {user.name || user.email} · {formatRoleLabel(user.role)}
        </Body>

        {error ? <ErrorBlock message={error} /> : null}
        {loading && meets.length === 0 && practices.length === 0 ? (
          <LoadingBlock />
        ) : (
          <>
            <Section title="Up next">
              {nextMeet ? (
                <ListRow
                  title={nextMeet.name}
                  subtitle={[
                    "Meet",
                    formatMeetDateRange(nextMeet.startDate, nextMeet.endDate),
                    nextMeet.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onPress={() => router.push(`/meets/${nextMeet.id}`)}
                />
              ) : (
                <Muted style={{ marginBottom: spacing.sm }}>
                  No upcoming meets
                </Muted>
              )}
              {nextPractice ? (
                <ListRow
                  title={nextPractice.title}
                  subtitle={[
                    "Practice",
                    formatPracticeDate(nextPractice.date),
                    `${nextPractice.startTime}–${nextPractice.endTime}`,
                    nextPractice.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onPress={() => router.push(`/practices/${nextPractice.id}`)}
                />
              ) : (
                <Muted style={{ marginBottom: spacing.sm }}>
                  No upcoming practices
                </Muted>
              )}
            </Section>

            <Section title="Shortcuts">
              <ListRow
                title="Meets"
                subtitle="Schedule, signups, and travel info"
                onPress={() => router.push("/meets")}
              />
              <ListRow
                title="Practices"
                subtitle="Published practice plans"
                onPress={() => router.push("/practices")}
              />
              <ListRow
                title="Nationals"
                subtitle="Qualifying time standards"
                onPress={() => router.push("/nationals")}
              />
              <ListRow
                title="Roster"
                subtitle="Browse the team"
                onPress={() => router.push("/roster")}
              />
              <ListRow
                title="Notifications"
                subtitle="In-app alerts"
                onPress={() => router.push("/notifications")}
              />
            </Section>
          </>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Button
            label="Settings"
            variant="secondary"
            onPress={() => router.push("/settings")}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

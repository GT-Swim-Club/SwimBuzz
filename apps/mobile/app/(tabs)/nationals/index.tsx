import { useCallback, useMemo, useState } from "react"
import { ScrollView, View } from "react-native"
import { useFocusEffect, useRouter } from "expo-router"
import { athleteDisplayName, formatTime } from "@swimbuzz/shared"
import {
  Chip,
  EmptyState,
  ErrorBlock,
  ListRow,
  LoadingBlock,
  Muted,
  Screen,
  Section,
  Title,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"

type CutRow = {
  id?: string
  event?: string
  gender?: string
  timeMs?: number
  note?: string | null
}

type QualifierAthlete = {
  athleteId: string
  athleteSlug?: string | null
  firstName: string
  lastName: string
  nicknames?: string[]
  gender: string
  events: Array<{
    event: string
    time?: string
    timeMs?: number
    cut?: string
    meetName?: string
  }>
}

const COURSES = ["SCY", "LCM"] as const

function genderLabel(gender: unknown) {
  if (gender === "F") return "Women"
  if (gender === "M") return "Men"
  return gender ? String(gender) : "Open"
}

function genderSortKey(gender: unknown) {
  if (gender === "F") return 0
  if (gender === "M") return 1
  return 2
}

export default function NationalsScreen() {
  const router = useRouter()
  const [seasons, setSeasons] = useState<string[]>([])
  const [season, setSeason] = useState<string | null>(null)
  const [course, setCourse] = useState<(typeof COURSES)[number]>("SCY")
  const [cuts, setCuts] = useState<CutRow[]>([])
  const [qualifiers, setQualifiers] = useState<QualifierAthlete[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadCuts = useCallback(async (activeSeason: string, activeCourse: string) => {
    setError(null)
    setLoading(true)
    try {
      const data = await api.getQualifiers({
        season: activeSeason,
        course: activeCourse,
      })
      const set = data.set
      const nextCuts =
        set && typeof set === "object" && Array.isArray((set as { cuts?: unknown }).cuts)
          ? ((set as { cuts: CutRow[] }).cuts ?? [])
          : []
      setCuts(nextCuts)
      setQualifiers(
        Array.isArray(data.qualifiers)
          ? (data.qualifiers as QualifierAthlete[])
          : []
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load qualifiers")
      setCuts([])
      setQualifiers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        setError(null)
        setLoading(true)
        try {
          const seasonList = await api.listSeasons()
          if (cancelled) return
          setSeasons(seasonList)
          const activeSeason = season ?? seasonList[0] ?? null
          if (!activeSeason) {
            setCuts([])
            setQualifiers([])
            setLoading(false)
            return
          }
          if (!season) {
            setSeason(activeSeason)
            return
          }
          await loadCuts(activeSeason, course)
        } catch (err) {
          if (cancelled) return
          setError(err instanceof Error ? err.message : "Failed to load qualifiers")
          setCuts([])
          setQualifiers([])
          setLoading(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [season, course, loadCuts])
  )

  const cutsByGender = useMemo(() => {
    const groups = new Map<string, CutRow[]>()
    for (const cut of cuts) {
      const key = String(cut.gender ?? "")
      const list = groups.get(key) ?? []
      list.push(cut)
      groups.set(key, list)
    }
    return [...groups.entries()].sort(
      ([a], [b]) => genderSortKey(a) - genderSortKey(b)
    )
  }, [cuts])

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Title>Nationals</Title>
        <Muted style={{ marginBottom: spacing.md }}>
          Qualifying standards and athletes who have made cuts this season.
        </Muted>

        {error ? <ErrorBlock message={error} /> : null}

        <Section title="Season">
          {seasons.length === 0 && !loading ? (
            <Muted>No seasons available.</Muted>
          ) : (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              {seasons.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  selected={season === label}
                  onPress={() => setSeason(label)}
                />
              ))}
            </View>
          )}
        </Section>

        <Section title="Course">
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {COURSES.map((value) => (
              <Chip
                key={value}
                label={value}
                selected={course === value}
                onPress={() => setCourse(value)}
              />
            ))}
          </View>
        </Section>

        {loading ? (
          <Section title="Qualified athletes">
            <LoadingBlock />
          </Section>
        ) : (
          <>
            <Section title={`Qualified athletes (${qualifiers.length})`}>
              {qualifiers.length === 0 ? (
                <EmptyState
                  title="No qualifiers yet"
                  body="No athletes have made an NQT cut for this season/course."
                />
              ) : (
                qualifiers.map((athlete) => (
                  <ListRow
                    key={athlete.athleteId}
                    title={athleteDisplayName({
                      firstName: athlete.firstName,
                      lastName: athlete.lastName,
                      nicknames: athlete.nicknames ?? [],
                    })}
                    subtitle={athlete.events
                      .map(
                        (e) =>
                          `${e.event} ${e.time ?? (typeof e.timeMs === "number" ? formatTime(e.timeMs) : "")}`.trim()
                      )
                      .join(" · ")}
                    onPress={() =>
                      router.push(
                        `/roster/${athlete.athleteSlug || athlete.athleteId}`
                      )
                    }
                  />
                ))
              )}
            </Section>

            {cuts.length === 0 ? (
              <Section title="Cuts">
                <EmptyState
                  title="No standards yet"
                  body={
                    season
                      ? `No ${course} cuts found for ${season}.`
                      : "Pick a season to view cuts."
                  }
                />
              </Section>
            ) : (
              cutsByGender.map(([gender, rows]) => (
                <Section
                  key={gender || "open"}
                  title={`${genderLabel(gender)} cuts`}
                >
                  {rows.map((cut, index) => (
                    <ListRow
                      key={cut.id ?? `${cut.event}-${cut.gender}-${index}`}
                      title={cut.event ?? "Event"}
                      subtitle={
                        typeof cut.timeMs === "number"
                          ? [formatTime(cut.timeMs), cut.note]
                              .filter(Boolean)
                              .join(" · ")
                          : cut.note ?? undefined
                      }
                    />
                  ))}
                </Section>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

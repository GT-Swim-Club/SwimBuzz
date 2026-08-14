import { useCallback, useMemo, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native"
import { useFocusEffect, useRouter } from "expo-router"
import type { PracticeSummary } from "@swimbuzz/shared"
import { formatClockTimeRange, isStaffRole } from "@swimbuzz/shared"
import {
  Button,
  Chip,
  EmptyState,
  ListRow,
  Screen,
  Section,
  TextField,
  Title,
} from "@swimbuzz/ui"
import { colors, spacing } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"

export default function PracticesScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const [practices, setPractices] = useState<PracticeSummary[]>([])
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await api.listPractices()
      setPractices(data)
      setTag((prev) => {
        if (!prev) return null
        const stillExists = data.some((p) => p.tags?.includes(prev))
        return stillExists ? prev : null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load practices")
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const tags = useMemo(() => {
    const set = new Set<string>()
    for (const practice of practices) {
      for (const t of practice.tags ?? []) {
        if (t.trim()) set.add(t.trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [practices])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return practices.filter((practice) => {
      if (tag && !(practice.tags ?? []).includes(tag)) return false
      if (q && !practice.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [practices, query, tag])

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <Title>Practices</Title>
      {isStaff ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Button
            label="New practice"
            onPress={() => router.push("/practices/new")}
          />
        </View>
      ) : null}
      <TextField
        label="Search"
        placeholder="Search practices by title"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {tags.length > 0 ? (
        <Section title="Tags">
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Chip
              label="All"
              selected={tag == null}
              onPress={() => setTag(null)}
            />
            {tags.map((t) => (
              <Chip
                key={t}
                label={t}
                selected={tag === t}
                onPress={() => setTag(t)}
              />
            ))}
          </View>
        </Section>
      ) : null}
      {loading && practices.length === 0 ? (
        <View style={{ paddingTop: 40 }}>
          <ActivityIndicator color={colors.light.primaryActive} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} />
          }
          ListEmptyComponent={
            <EmptyState
              title={
                error
                  ? "Could not load practices"
                  : practices.length === 0
                    ? "No practices yet"
                    : "No matching practices"
              }
              body={error ?? undefined}
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.title}
              subtitle={[
                item.date
                  ? new Date(item.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : null,
                formatClockTimeRange(item.startTime, item.endTime),
                item.location,
                item.focus,
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => router.push(`/practices/${item.id}`)}
            />
          )}
        />
      )}
    </Screen>
  )
}

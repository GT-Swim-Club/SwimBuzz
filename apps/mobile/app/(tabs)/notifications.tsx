import { useCallback, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  View,
} from "react-native"
import { useFocusEffect, useRouter } from "expo-router"
import { formatDateTime, type NotificationItem } from "@swimbuzz/shared"
import { Button, EmptyState, ListRow, Screen, Title } from "@swimbuzz/ui"
import { colors, spacing } from "@swimbuzz/tokens"
import { api } from "../../src/lib/api"
import { isExternalUrl, resolveAppHref } from "../../src/lib/href"

export default function NotificationsScreen() {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await api.listNotifications()
      setItems(data.notifications)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications")
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  async function onOpen(item: NotificationItem) {
    if (!item.readAt) {
      try {
        await api.markNotificationRead(item.id)
        setItems((prev) =>
          prev.map((n) =>
            n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n
          )
        )
      } catch {
        // ignore
      }
    }
    if (!item.href) return

    const appHref = resolveAppHref(item.href)
    if (appHref) {
      router.push(appHref)
      return
    }
    if (isExternalUrl(item.href)) {
      await Linking.openURL(item.href)
    }
  }

  async function markAll() {
    await api.markAllNotificationsRead()
    await load()
  }

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <Title>Notifications</Title>
      <View style={{ marginBottom: spacing.sm }}>
        <Button label="Mark all read" variant="secondary" onPress={() => void markAll()} />
      </View>
      {loading && items.length === 0 ? (
        <View style={{ paddingTop: 40 }}>
          <ActivityIndicator color={colors.light.primaryActive} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} />
          }
          ListEmptyComponent={
            <EmptyState
              title={error ? "Could not load notifications" : "You're all caught up"}
              body={error ?? undefined}
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.title}
              subtitle={[
                item.body,
                formatDateTime(item.createdAt),
                item.readAt ? "Read" : "Unread",
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => void onOpen(item)}
            />
          )}
        />
      )}
    </Screen>
  )
}

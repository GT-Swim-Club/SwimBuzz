import { useCallback } from "react"
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  View,
} from "react-native"
import { useFocusEffect, useRouter } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDateTime, type NotificationItem } from "@swimbuzz/shared"
import { Button, EmptyState, FlatList, ListRow, Screen, usePalette } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../../src/lib/api"
import { useTabBarScrollPadding } from "../../src/lib/tab-bar"
import { isExternalUrl, resolveAppHref } from "../../src/lib/href"
import { RelativeDateText } from "../../src/components/RelativeDateText"

export default function NotificationsScreen() {
  const router = useRouter()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const queryClient = useQueryClient()

  // Shared ["notifications"] key with (tabs)/notifications.tsx and
  // AppHeader's unread badge — one request instead of one per consumer.
  const {
    data,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({ queryKey: ["notifications"], queryFn: () => api.listNotifications() })
  const items = data?.notifications ?? []

  // This screen (reached from the header bell) auto-marks everything read
  // on every visit — distinct from the tab screen, which only does it on tap.
  useFocusEffect(
    useCallback(() => {
      let active = true
      void (async () => {
        try {
          await api.markAllNotificationsRead()
        } catch {
          // still refresh the list
        }
        if (active) await refetch()
      })()
      return () => {
        active = false
      }
    }, [refetch])
  )

  async function onOpen(item: NotificationItem) {
    if (!item.readAt) {
      const previous = queryClient.getQueryData(["notifications"])
      queryClient.setQueryData(
        ["notifications"],
        (old: typeof data) =>
          old && {
            ...old,
            notifications: old.notifications.map((n) =>
              n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n
            ),
          }
      )
      try {
        await api.markNotificationRead(item.id)
      } catch {
        queryClient.setQueryData(["notifications"], previous)
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
    await refetch()
  }

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <View style={{ marginBottom: spacing.sm }}>
        <Button label="Mark all read" variant="secondary" onPress={() => void markAll()} />
      </View>
      {isPending ? (
        <View style={{ paddingTop: 40 }}>
          <ActivityIndicator color={c.primaryActive} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: tabBarPad }}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <EmptyState
              title={error ? "Could not load notifications" : "You're all caught up"}
              body={error instanceof Error ? error.message : undefined}
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.title}
              subtitleSegments={[
                item.body,
                <RelativeDateText
                  value={item.createdAt}
                  kind="instant"
                  absolute={formatDateTime(item.createdAt)}
                  style={{ fontSize: 13, color: c.textSecondary }}
                />,
                item.readAt ? "Read" : "Unread",
              ]}
              onPress={() => void onOpen(item)}
            />
          )}
        />
      )}
    </Screen>
  )
}

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

type NotificationsData = { notifications: NotificationItem[] }

export default function NotificationsScreen() {
  const router = useRouter()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const queryClient = useQueryClient()

  // Shared ["notifications"] key with AppHeader's badge — one request, and the
  // badge follows what this screen writes into the cache.
  const {
    data,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({ queryKey: ["notifications"], queryFn: () => api.listNotifications() })
  const items = data?.notifications ?? []
  const hasUnread = items.some((n) => !n.readAt)

  // Opening the list clears the badge (seen); each item stays highlighted until tapped (read).
  useFocusEffect(
    useCallback(() => {
      let active = true
      void (async () => {
        try {
          await api.markNotificationsSeen()
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

  function setReadLocally(match: (item: NotificationItem) => boolean) {
    const now = new Date().toISOString()
    queryClient.setQueryData<NotificationsData>(["notifications"], (old) =>
      old && {
        ...old,
        notifications: old.notifications.map((n) =>
          match(n) && !n.readAt ? { ...n, readAt: now, seenAt: n.seenAt ?? now } : n
        ),
      }
    )
  }

  async function onOpen(item: NotificationItem) {
    if (!item.readAt) {
      const previous = queryClient.getQueryData(["notifications"])
      setReadLocally((n) => n.id === item.id)
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

  async function markAllRead() {
    const previous = queryClient.getQueryData(["notifications"])
    setReadLocally(() => true)
    try {
      await api.markAllNotificationsRead()
    } catch {
      queryClient.setQueryData(["notifications"], previous)
    }
  }

  return (
    <Screen style={{ paddingBottom: 0 }}>
      {hasUnread ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Button label="Mark all read" variant="secondary" onPress={() => void markAllRead()} />
        </View>
      ) : null}
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
              left={
                <View
                  accessible={!item.readAt}
                  accessibilityLabel={item.readAt ? undefined : "Unread"}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    ...(item.readAt ? null : { backgroundColor: c.primary }),
                  }}
                />
              }
              subtitleSegments={[
                item.body,
                <RelativeDateText
                  value={item.createdAt}
                  kind="instant"
                  absolute={formatDateTime(item.createdAt)}
                  style={{ fontSize: 13, color: c.textSecondary }}
                />,
              ]}
              onPress={() => void onOpen(item)}
            />
          )}
        />
      )}
    </Screen>
  )
}

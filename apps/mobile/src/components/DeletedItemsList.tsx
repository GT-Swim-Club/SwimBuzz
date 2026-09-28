import { useState } from "react"
import { Alert, RefreshControl, Text, View } from "react-native"
import { formatFullDate, recoveryCountdown } from "@swimbuzz/shared"
import type { DeletedItem } from "@swimbuzz/api"
import {
  ActionSheet,
  EmptyState,
  FlatList,
  IconButton,
  ListRow,
  ListRowSkeleton,
  usePalette,
  useToast,
  type ActionSheetItem,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { Icon } from "./Icon"
import { RelativeDateText } from "./RelativeDateText"
import { useDeletedItems } from "../lib/use-deleted-items"

export function DeletedItemsList({ kind, tabBarPad }: { kind: "practice" | "meet"; tabBarPad: number }) {
  const c = usePalette()
  const { showToast } = useToast()
  const { items, error, isPending, isFetching, busyId, restore, purge, refetch } = useDeletedItems(kind, true)
  const [sheetItem, setSheetItem] = useState<DeletedItem | null>(null)

  async function handleRestore(item: DeletedItem) {
    try {
      await restore(item)
      showToast(`${item.name} restored.`)
    } catch (err) {
      Alert.alert("Could not restore", err instanceof Error ? err.message : "Something went wrong")
    }
  }

  async function handlePermanentDelete(item: DeletedItem) {
    try {
      await purge(item)
      showToast(`${item.name} permanently deleted.`)
    } catch (err) {
      Alert.alert("Could not delete", err instanceof Error ? err.message : "Something went wrong")
    }
  }

  function confirmPermanentDelete(item: DeletedItem) {
    Alert.alert(
      `Delete ${item.name} permanently?`,
      item.kind === "meet" && item.deleteSwimsOnPurge
        ? "This can't be undone. Its swims will be permanently deleted too."
        : "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void handlePermanentDelete(item) },
      ]
    )
  }

  const sheetGroups: ActionSheetItem[][] = sheetItem
    ? [
        [
          {
            key: "restore",
            label: "Restore",
            icon: <Icon name="rotateCcw" size={18} color={c.text} />,
            disabled: !sheetItem.canRestore,
            busy: busyId === sheetItem.id,
            onPress: () => {
              const item = sheetItem
              setSheetItem(null)
              void handleRestore(item)
            },
          },
        ],
        [
          {
            key: "delete",
            label: "Delete Permanently",
            icon: <Icon name="trash" size={18} color={c.error} />,
            destructive: true,
            busy: busyId === sheetItem.id,
            onPress: () => {
              const item = sheetItem
              setSheetItem(null)
              confirmPermanentDelete(item)
            },
          },
        ],
      ]
    : []

  if (isPending) {
    return (
      <View style={{ gap: spacing.sm }}>
        {[...Array(5)].map((_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </View>
    )
  }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: tabBarPad }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
        ListEmptyComponent={
          <EmptyState
            title={error ? "Could not load Trash" : "Trash is empty"}
            body={error instanceof Error ? error.message : undefined}
          />
        }
        renderItem={({ item }) => {
          const countdown = recoveryCountdown(item.purgeAfter)
          const toneColor =
            countdown.tone === "expired" ? c.error : countdown.tone === "warning" ? c.warning : c.textSecondary
          return (
            <ListRow
              title={item.name}
              left={
                <Icon
                  color={c.textTertiary}
                  name={item.kind === "practice" ? "fileText" : "trophy"}
                  size={20}
                />
              }
              subtitleSegments={[
                <RelativeDateText
                  value={item.startsAt}
                  kind="event"
                  timeZone={item.timeZone}
                  absolute={formatFullDate(item.startsAt, item.timeZone)}
                  style={{ fontSize: 13, color: c.textSecondary }}
                />,
                <Text style={{ fontSize: 13, fontWeight: "600", color: toneColor }}>{countdown.label}</Text>,
              ]}
              right={
                <IconButton
                  label={item.canRestore ? "Restore" : "Expired"}
                  accessibilityLabel={`Restore ${item.name}`}
                  disabled={busyId === item.id || !item.canRestore}
                  onPress={() => void handleRestore(item)}
                />
              }
              onPress={() => setSheetItem(item)}
            />
          )
        }}
      />
      <ActionSheet
        visible={!!sheetItem}
        onClose={() => setSheetItem(null)}
        title={sheetItem?.name}
        groups={sheetGroups}
      />
    </>
  )
}

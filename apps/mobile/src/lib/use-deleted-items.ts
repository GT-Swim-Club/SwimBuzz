import { useCallback, useState } from "react"
import { useFocusEffect } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { DeletedItem } from "@swimbuzz/api"
import { api } from "./api"

/**
 * Fetches and manages restore/permanent-delete for one kind of soft-deleted item —
 * shared by the Practices and Meets tabs' inline "Deleted" view. Both kinds share the
 * ["recently-deleted"] query key so switching tabs doesn't refetch twice.
 */
export function useDeletedItems(kind: "practice" | "meet", enabled: boolean) {
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ["recently-deleted"],
    queryFn: () => api.listRecentlyDeleted(),
    enabled,
  })
  useFocusEffect(
    useCallback(() => {
      if (enabled) void refetch()
    }, [enabled, refetch])
  )

  const items = data?.items.filter((item) => item.kind === kind) ?? []

  async function invalidateAfterChange() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recently-deleted"] }),
      queryClient.invalidateQueries({ queryKey: ["practices"] }),
      queryClient.invalidateQueries({ queryKey: ["meets"] }),
    ])
  }

  async function restore(item: DeletedItem) {
    setBusyId(item.id)
    try {
      await api.restoreDeleted(item.kind, item.id)
      await invalidateAfterChange()
    } finally {
      setBusyId(null)
    }
  }

  async function purge(item: DeletedItem) {
    setBusyId(item.id)
    try {
      await api.purgeDeleted(item.kind, item.id)
      await invalidateAfterChange()
    } finally {
      setBusyId(null)
    }
  }

  return { items, error, isPending, isFetching, busyId, restore, purge, refetch }
}

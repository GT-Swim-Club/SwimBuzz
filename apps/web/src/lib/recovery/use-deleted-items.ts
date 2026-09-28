"use client"

import { useCallback, useEffect, useState } from "react"
import { createApiClient, type DeletedItem } from "@swimbuzz/api"

const api = createApiClient({})

/** Fetches and manages restore/permanent-delete for one kind of soft-deleted item — shared by the practices rail and meets "Deleted" view. */
export function useDeletedItems(kind: "practice" | "meet") {
  const [items, setItems] = useState<DeletedItem[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.listRecentlyDeleted()
      setItems(res.items.filter((item) => item.kind === kind))
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load deleted items")
    }
  }, [kind])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(item: DeletedItem) {
    setBusy(item.id)
    try {
      await api.restoreDeleted(item.kind, item.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  async function purge(item: DeletedItem) {
    setBusy(item.id)
    try {
      await api.purgeDeleted(item.kind, item.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  return { items, error, busy, restore, purge, reload: load }
}

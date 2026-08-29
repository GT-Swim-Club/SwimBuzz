import { useEffect } from "react"
import { AppState, type AppStateStatus } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { QueryClient, focusManager } from "@tanstack/react-query"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"

const PERSIST_KEY = "swimbuzz.query-cache"

/**
 * Shared QueryClient instance — imported directly (not via context) by
 * clearSession() in api.ts, which needs to wipe cached data on sign-out
 * before the next user's session starts.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on every screen focus — cached data renders instantly,
      // and revalidates in the background only once it's actually stale.
      staleTime: 30_000,
      // Survive unmount and app restart (paired with the AsyncStorage persister).
      gcTime: 24 * 60 * 60_000,
      retry: 1,
    },
  },
})

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: PERSIST_KEY,
})

/** Wipe both the in-memory and persisted cache — call on sign-out. */
export async function clearPersistedQueryCache() {
  queryClient.clear()
  await AsyncStorage.removeItem(PERSIST_KEY)
}

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === "active")
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange)
    return () => subscription.remove()
  }, [])

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60_000 }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}

import * as SecureStore from "expo-secure-store"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { createApiClient } from "@swimbuzz/api"
import type { AuthTokens, SessionUser } from "@swimbuzz/shared"
import { clearPersistedQueryCache } from "./query"

// Kept as a literal (not imported from view-preferences.tsx) to avoid a
// require cycle — that module imports `api` from this file.
const VIEW_PREFERENCES_KEY = "swimbuzz.viewPreferences"

const ACCESS_KEY = "swimbuzz.accessToken"
const REFRESH_KEY = "swimbuzz.refreshToken"
const USER_KEY = "swimbuzz.user"

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://swimbuzz.gtswimclub.com"

/**
 * Public web origin — distinct from API_URL, which in dev points at a LAN IP
 * that isn't reachable outside the local network. Used to build shareable
 * links (Copy link, Share PDF/PNG) so they always point somewhere the
 * recipient can actually open.
 */
export const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "") ||
  "https://swimbuzz.gtswimclub.com"

let memoryAccess: string | null = null
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

export async function getAccessToken() {
  if (memoryAccess) return memoryAccess
  memoryAccess = await SecureStore.getItemAsync(ACCESS_KEY)
  return memoryAccess
}

export const api = createApiClient({
  baseUrl: API_URL,
  getAccessToken,
  onUnauthorized: () => onUnauthorized?.(),
})

export async function saveSession(tokens: AuthTokens) {
  memoryAccess = tokens.accessToken
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken)
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken)
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(tokens.user))
}

export async function clearSession() {
  memoryAccess = null
  await SecureStore.deleteItemAsync(ACCESS_KEY)
  await SecureStore.deleteItemAsync(REFRESH_KEY)
  await SecureStore.deleteItemAsync(USER_KEY)
  // One user's cached data must never render for the next — wipe both the
  // in-memory and persisted query cache, plus the locally-cached view
  // preferences, on sign-out.
  await clearPersistedQueryCache()
  await AsyncStorage.removeItem(VIEW_PREFERENCES_KEY).catch(() => {})
}

export async function loadStoredUser(): Promise<SessionUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

export async function refreshSession(): Promise<AuthTokens | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY)
  if (!refreshToken) return null
  try {
    const tokens = await api.mobileRefresh(refreshToken)
    await saveSession(tokens)
    return tokens
  } catch {
    await clearSession()
    return null
  }
}

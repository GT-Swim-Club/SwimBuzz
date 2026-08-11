import * as SecureStore from "expo-secure-store"
import { createApiClient } from "@swimbuzz/api"
import type { AuthTokens, SessionUser } from "@swimbuzz/shared"

const ACCESS_KEY = "swimbuzz.accessToken"
const REFRESH_KEY = "swimbuzz.refreshToken"
const USER_KEY = "swimbuzz.user"

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
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

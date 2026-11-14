import { Alert, Platform } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Device from "expo-device"
import * as Notifications from "expo-notifications"
import Constants from "expo-constants"
import { api } from "./api"

/** The Expo push token this device registered for the signed-in user (removed on sign-out). */
const TOKEN_KEY = "swimbuzz.pushToken"
/** Set once we've asked for notification permission, so the app only asks once. */
const ASKED_KEY = "swimbuzz.pushPermissionAsked"

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

async function ensureAndroidChannel() {
  // Android 13+ only shows the permission prompt once a channel exists.
  if (Platform.OS !== "android") return
  await Notifications.setNotificationChannelAsync("default", {
    name: "Notifications",
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

/** Get this device's Expo push token and register it with the API for the signed-in user. */
async function registerToken(): Promise<string> {
  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId && projectId !== "replace-with-eas-project-id" ? { projectId } : undefined
  )
  const token = tokenResponse.data

  await api.registerPushToken({
    token,
    platform: Platform.OS === "ios" ? "ios" : "android",
    deviceId: Constants.sessionId,
  })
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {})
  return token
}

function pushUnavailable(): string | null {
  if (Platform.OS === "web") return "Push is not available on web"
  if (!Device.isDevice) return "Push requires a physical device"
  return null
}

/**
 * Ask for permission (the system prompt) if needed, then register. For an explicit
 * "Turn on push notifications" control; returns a status line for the UI.
 */
export async function registerForPushNotifications(): Promise<string> {
  const unavailable = pushUnavailable()
  if (unavailable) return unavailable

  await ensureAndroidChannel()
  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
    await AsyncStorage.setItem(ASKED_KEY, "1").catch(() => {})
  }
  if (finalStatus !== "granted") {
    return "Permission not granted"
  }

  await registerToken()
  return `Registered (${Platform.OS})`
}

/**
 * On sign-in and app start: register silently when permission is already granted (tokens can
 * change, and a device may have been registered to someone else). When the user has never been
 * asked, explain once why and offer the system prompt. Never throws.
 */
export async function syncPushRegistration(): Promise<void> {
  if (pushUnavailable()) return
  try {
    await ensureAndroidChannel()
    const { status, canAskAgain } = await Notifications.getPermissionsAsync()
    if (status === "granted") {
      await registerToken()
      return
    }
    if (status !== "undetermined" || !canAskAgain) return
    if (await AsyncStorage.getItem(ASKED_KEY).catch(() => "1")) return
    await AsyncStorage.setItem(ASKED_KEY, "1").catch(() => {})
    Alert.alert(
      "Turn on notifications?",
      "Get told when practices are posted, meet sheets and results go up, your relay lineups are set, and when someone replies to you. You can choose which ones in Settings.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Turn on",
          onPress: () => {
            void registerForPushNotifications().catch((err) => {
              console.warn("[push] registration failed", err)
            })
          },
        },
      ]
    )
  } catch (err) {
    console.warn("[push] registration failed", err)
  }
}

/**
 * Sign-out: stop this device getting the signed-out user's pushes. Needs the session still valid,
 * so call it before clearing tokens. Best effort; never throws.
 */
export async function unregisterPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null)
  if (!token) return
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {})
  try {
    await api.removePushToken(token)
  } catch {
    // Offline or already signed out server-side: the next user to register this device's
    // token takes it over (the API reassigns tokens on register).
  }
}

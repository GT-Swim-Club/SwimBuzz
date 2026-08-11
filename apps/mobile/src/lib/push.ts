import { Platform } from "react-native"
import * as Device from "expo-device"
import * as Notifications from "expo-notifications"
import Constants from "expo-constants"
import { api } from "./api"

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerForPushNotifications(): Promise<string> {
  if (Platform.OS === "web") {
    return "Push is not available on web"
  }

  if (!Device.isDevice) {
    return "Push requires a physical device"
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== "granted") {
    return "Permission not granted"
  }

  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
      ?.projectId

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId && projectId !== "replace-with-eas-project-id"
      ? { projectId }
      : undefined
  )
  const token = tokenResponse.data

  await api.registerPushToken({
    token,
    platform: Platform.OS === "ios" ? "ios" : "android",
    deviceId: Constants.sessionId,
  })

  return `Registered (${Platform.OS})`
}

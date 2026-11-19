import { useCallback, useEffect, useState } from "react"
import { Alert, AppState, Linking, Platform } from "react-native"
import { useFocusEffect } from "expo-router"
import * as Notifications from "expo-notifications"
import { ListRow, Muted } from "@swimbuzz/ui"
import { registerForPushNotifications } from "../lib/push"

type PushPermission = "on" | "off" | "never-asked"

async function readPushPermission(): Promise<PushPermission> {
  const permission = await Notifications.getPermissionsAsync()
  if (permission.granted) return "on"
  if (permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return "on"
  return permission.status === "undetermined" ? "never-asked" : "off"
}

/**
 * "Push notifications: On / Off" for this device. Tapping asks for permission
 * the first time (and registers the device); after that the choice lives in
 * the system settings, so it opens them. Hidden on web.
 */
export function PushNotificationsRow() {
  const [permission, setPermission] = useState<PushPermission | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    void readPushPermission()
      .then(setPermission)
      .catch(() => setPermission(null))
  }, [])

  useFocusEffect(refresh)

  // Coming back from the system settings — show the new state.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh()
    })
    return () => sub.remove()
  }, [refresh])

  if (Platform.OS === "web") return null

  async function onPress() {
    if (permission !== "never-asked") {
      void Linking.openSettings()
      return
    }
    setBusy(true)
    try {
      const result = await registerForPushNotifications()
      setPermission(await readPushPermission())
      // A simulator can't receive push at all, or registering failed — say why.
      if (!result.startsWith("Registered") && result !== "Permission not granted") {
        Alert.alert("Push notifications", result)
      }
    } catch (err) {
      Alert.alert(
        "Push notifications",
        err instanceof Error ? err.message : "Something went wrong"
      )
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <ListRow
      title="Push Notifications"
      subtitle={
        permission === "never-asked"
          ? "Tap to allow alerts on this device"
          : "Change this in your device's settings"
      }
      onPress={busy ? undefined : () => void onPress()}
      accessory={
        <Muted>{permission == null ? "" : permission === "on" ? "On" : "Off"}</Muted>
      }
    />
  )
}

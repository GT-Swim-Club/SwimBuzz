import { useEffect, useRef, useState } from "react"
import { Linking } from "react-native"
import { useRootNavigationState, useRouter } from "expo-router"
import * as Notifications from "expo-notifications"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "../lib/auth"
import { isExternalUrl, resolveAppHref } from "../lib/href"
import { syncPushRegistration } from "../lib/push"

function hrefOf(response: Notifications.NotificationResponse | null | undefined): string | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null
  const href = response.notification.request.content.data?.href
  return typeof href === "string" && href.trim() ? href : null
}

/**
 * Push plumbing for the signed-in app, rendered once in the root layout:
 * - registers this device on sign-in / app start (asks for permission once, with an explanation);
 * - opens the notification's link when one is tapped, including the tap that launched the app;
 * - refreshes the notifications list (and the bell badge) when one arrives in the foreground.
 */
export function PushNotificationsBridge() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const navigationState = useRootNavigationState()
  const queryClient = useQueryClient()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const userId = user?.id ?? null
  const registeredFor = useRef<string | null>(null)

  useEffect(() => {
    if (!userId || registeredFor.current === userId) return
    registeredFor.current = userId
    void syncPushRegistration()
  }, [userId])
  useEffect(() => {
    if (!userId) registeredFor.current = null
  }, [userId])

  // Taps: the one that cold-started the app, then any while it runs.
  useEffect(() => {
    const launch = hrefOf(Notifications.getLastNotificationResponse())
    if (launch) {
      setPendingHref(launch)
      Notifications.clearLastNotificationResponse()
    }
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const href = hrefOf(response)
      if (href) setPendingHref(href)
      Notifications.clearLastNotificationResponse()
    })
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
    })
    return () => {
      tapped.remove()
      received.remove()
    }
  }, [queryClient])

  // Navigate once the router is mounted and the user is signed in (the launch screen's own
  // redirect runs first, so the link opens on top of it).
  const navigationReady = Boolean(navigationState?.key)
  useEffect(() => {
    if (!pendingHref || !navigationReady || loading || !user) return
    const href = pendingHref
    const timer = setTimeout(() => {
      setPendingHref(null)
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
      const appHref = resolveAppHref(href)
      if (appHref) router.push(appHref)
      else if (isExternalUrl(href)) void Linking.openURL(href)
      else router.push("/notifications")
    }, 250)
    return () => clearTimeout(timer)
  }, [pendingHref, navigationReady, loading, user, router, queryClient])

  return null
}

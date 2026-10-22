import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Platform, ScrollView, Switch, View } from "react-native"
import { Redirect, useRouter } from "expo-router"
import { useFocusEffect } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_META,
  formatRoleLabel,
  isStaffRole,
  STAFF_TITLE_LABELS,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@swimbuzz/shared"
import {
  Body,
  Button,
  ErrorBlock,
  LoadingBlock,
  Muted,
  Screen,
  Section,
  Title,
} from "@swimbuzz/ui"
import { colors, spacing } from "@swimbuzz/tokens"
import { api } from "../../src/lib/api"
import { useAuth } from "../../src/lib/auth"
import { registerForPushNotifications } from "../../src/lib/push"

export default function SettingsScreen() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pushStatus, setPushStatus] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const [savingPrefKey, setSavingPrefKey] = useState<string | null>(null)

  const email = user?.email?.trim().toLowerCase() ?? null

  // Shares the ["athletes"] cache with the roster and you screens.
  const {
    data: athletes = [],
    isPending: athletesPending,
    error: athletesError,
  } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.listAthletes(),
    enabled: Boolean(email),
  })
  const match = useMemo(
    () =>
      email
        ? athletes.find((a) => a.user?.email?.trim().toLowerCase() === email)
        : undefined,
    [athletes, email]
  )

  const {
    data: prefRes,
    isPending: prefsPending,
  } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.getNotificationPreferences(),
  })

  const pageLoading =
    (Boolean(email) && athletesPending) ||
    prefsPending
  const error = athletesError instanceof Error ? athletesError.message : null

  useEffect(() => {
    if (prefRes?.preferences) {
      setPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...prefRes.preferences })
    }
  }, [prefRes])

  useFocusEffect(
    useCallback(() => {
      if (!user) return
      void (async () => {
        const result = await registerForPushNotifications()
        setPushStatus(result)
      })()
    }, [user])
  )

  if (!loading && !user) return <Redirect href="/sign-in" />
  if (!user) return null

  async function togglePreference(
    key: NotificationPreferenceKey,
    value: boolean
  ) {
    const previous = preferences
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    setSavingPrefKey(key)
    try {
      const res = await api.updateNotificationPreferences({ [key]: value })
      const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...res.preferences }
      setPreferences(merged)
      queryClient.setQueryData(["notification-preferences"], res)
    } catch (err) {
      setPreferences(previous)
      Alert.alert(
        "Could not update preference",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingPrefKey(null)
    }
  }

  const isAthlete = Boolean(match) || user.role === "ATHLETE"

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Title>Settings</Title>
        <Body style={{ marginBottom: spacing.xs }}>
          {user.name || "Signed in"}
        </Body>
        <Muted style={{ marginBottom: spacing.lg }}>
          {user.email} ·{" "}
          {user.staffTitle ? STAFF_TITLE_LABELS[user.staffTitle] : formatRoleLabel(user.role)}
        </Muted>

        {error ? <ErrorBlock message={error} /> : null}
        {pageLoading ? <LoadingBlock /> : null}

        {pushStatus ? (
          <Muted style={{ marginBottom: spacing.md }}>Push: {pushStatus}</Muted>
        ) : null}

        <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
          {Platform.OS !== "web" ? (
            <Button
              label="Enable push notifications"
              variant="secondary"
              onPress={async () => {
                const result = await registerForPushNotifications()
                setPushStatus(result)
                Alert.alert("Push notifications", result)
              }}
            />
          ) : null}
        </View>

        <Section title="Notification preferences">
          {NOTIFICATION_PREFERENCE_META.filter(
            ({ athletesOnly, staffOnly, meetDirectorsOnly }) =>
              (!athletesOnly || isAthlete) &&
              (!staffOnly || isStaffRole(user.role)) &&
              (!meetDirectorsOnly || user.staffTitle === "MEET_DIRECTOR")
          ).map(({ key, label, description, athleteDescription }) => (
            <View
              key={key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.md,
                paddingVertical: spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: colors.light.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: "600" }}>{label}</Body>
                <Muted>
                  {isAthlete && athleteDescription
                    ? athleteDescription
                    : description}
                </Muted>
              </View>
              <Switch
                value={Boolean(preferences[key])}
                disabled={savingPrefKey === key}
                onValueChange={(value) => void togglePreference(key, value)}
                trackColor={{
                  false: colors.light.fill,
                  true: colors.light.primary,
                }}
                thumbColor={colors.light.bgContainer}
              />
            </View>
          ))}
        </Section>

        <Button
          label="Sign out"
          variant="danger"
          onPress={async () => {
            await signOut()
            router.replace("/sign-in")
          }}
        />
      </ScrollView>
    </Screen>
  )
}

import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Platform, ScrollView, Switch, View } from "react-native"
import { Redirect, useRouter } from "expo-router"
import { useFocusEffect } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_META,
  formatRoleLabel,
  STAFF_TITLE_LABELS,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@swimbuzz/shared"
import {
  Body,
  Button,
  ErrorBlock,
  LoadingBlock,
  MetaRow,
  Muted,
  Screen,
  Section,
  TextField,
  Title,
} from "@swimbuzz/ui"
import { colors, spacing } from "@swimbuzz/tokens"
import { api } from "../../src/lib/api"
import { useAuth } from "../../src/lib/auth"
import { registerForPushNotifications } from "../../src/lib/push"

type OwnAthlete = {
  id: string
  nicknames: string[]
  swimCloudId: string
}

export default function SettingsScreen() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pushStatus, setPushStatus] = useState<string | null>(null)
  const [nicknames, setNicknames] = useState("")
  const [swimCloudId, setSwimCloudId] = useState("")
  const [savingAthlete, setSavingAthlete] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const [savingPrefKey, setSavingPrefKey] = useState<string | null>(null)

  const email = user?.email?.trim().toLowerCase() ?? null

  // Shares the ["athletes"] / ["athlete", id] cache with the roster and
  // you screens.
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
    data: athleteDetail,
    isPending: athleteDetailPending,
  } = useQuery({
    queryKey: ["athlete", match?.id],
    queryFn: () => api.getAthlete(match!.id),
    enabled: Boolean(match?.id),
  })

  const {
    data: prefRes,
    isPending: prefsPending,
  } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.getNotificationPreferences(),
  })

  const pageLoading =
    (Boolean(email) && (athletesPending || (Boolean(match) && athleteDetailPending))) ||
    prefsPending
  const error = athletesError instanceof Error ? athletesError.message : null

  const ownAthlete: OwnAthlete | null = useMemo(() => {
    if (!match || !athleteDetail) return null
    const nextNicknames = Array.isArray(athleteDetail.nicknames)
      ? (athleteDetail.nicknames as string[])
      : []
    const nextSwimCloud =
      athleteDetail.swimCloudId == null || athleteDetail.swimCloudId === ""
        ? ""
        : String(athleteDetail.swimCloudId)
    return {
      id: String(athleteDetail.id ?? match.id),
      nicknames: nextNicknames,
      swimCloudId: nextSwimCloud,
    }
  }, [match, athleteDetail])

  useEffect(() => {
    setNicknames(ownAthlete?.nicknames.join(", ") ?? "")
    setSwimCloudId(ownAthlete?.swimCloudId ?? "")
  }, [ownAthlete])

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

  async function saveAthleteProfile() {
    if (!ownAthlete) return
    setSavingAthlete(true)
    try {
      const parsedNicknames = nicknames
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
      const body: Record<string, unknown> = {
        nicknames: parsedNicknames,
      }
      const trimmedId = swimCloudId.trim()
      body.swimCloudId = trimmedId === "" ? null : trimmedId
      await api.updateAthlete(ownAthlete.id, body)
      Alert.alert(
        "Saved",
        "Profile changes submitted. Nickname and SwimCloud updates may need coach approval."
      )
      await queryClient.invalidateQueries({ queryKey: ["athlete", ownAthlete.id] })
      await queryClient.invalidateQueries({ queryKey: ["athletes"] })
    } catch (err) {
      Alert.alert(
        "Could not save profile",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setSavingAthlete(false)
    }
  }

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

  const isAthlete = Boolean(ownAthlete) || user.role === "ATHLETE"

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

        {ownAthlete ? (
          <Section title="Athlete profile">
            <TextField
              label="Nicknames"
              value={nicknames}
              onChangeText={setNicknames}
              placeholder="Comma-separated"
              autoCapitalize="words"
            />
            <TextField
              label="SwimCloud ID"
              value={swimCloudId}
              onChangeText={setSwimCloudId}
              placeholder="Optional"
              keyboardType="number-pad"
            />
            <Button
              label="Save athlete profile"
              loading={savingAthlete}
              onPress={() => void saveAthleteProfile()}
            />
          </Section>
        ) : null}

        <Section title="Notification preferences">
          {NOTIFICATION_PREFERENCE_META.filter(
            ({ athletesOnly }) => !athletesOnly || isAthlete
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
          {preferences.meetSignupNotificationTimes?.length ? (
            <MetaRow
              label="Signup reminders"
              value={preferences.meetSignupNotificationTimes
                .map((m) => (m === 0 ? "At open" : `${m}m before`))
                .join(", ")}
            />
          ) : null}
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

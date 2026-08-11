import { useCallback, useState } from "react"
import { Alert, Platform, ScrollView, Switch, View } from "react-native"
import { Redirect, useRouter } from "expo-router"
import { useFocusEffect } from "expo-router"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_META,
  formatRoleLabel,
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
  const [pushStatus, setPushStatus] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ownAthlete, setOwnAthlete] = useState<OwnAthlete | null>(null)
  const [nicknames, setNicknames] = useState("")
  const [swimCloudId, setSwimCloudId] = useState("")
  const [savingAthlete, setSavingAthlete] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const [savingPrefKey, setSavingPrefKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setError(null)
    try {
      const [athletes, prefRes] = await Promise.all([
        api.listAthletes(),
        api.getNotificationPreferences().catch(() => null),
      ])

      if (prefRes?.preferences) {
        setPreferences({
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...prefRes.preferences,
        })
      }

      const email = user.email?.trim().toLowerCase()
      const match = email
        ? athletes.find(
            (a) => a.user?.email?.trim().toLowerCase() === email
          )
        : null

      if (match) {
        const detail = await api.getAthlete(match.id)
        const nextNicknames = Array.isArray(detail.nicknames)
          ? (detail.nicknames as string[])
          : []
        const nextSwimCloud =
          detail.swimCloudId == null || detail.swimCloudId === ""
            ? ""
            : String(detail.swimCloudId)
        setOwnAthlete({
          id: String(detail.id ?? match.id),
          nicknames: nextNicknames,
          swimCloudId: nextSwimCloud,
        })
        setNicknames(nextNicknames.join(", "))
        setSwimCloudId(nextSwimCloud)
      } else {
        setOwnAthlete(null)
        setNicknames("")
        setSwimCloudId("")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings")
    } finally {
      setPageLoading(false)
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      if (!user) return
      void (async () => {
        const result = await registerForPushNotifications()
        setPushStatus(result)
      })()
      void load()
    }, [user, load])
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
      await load()
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
      setPreferences({
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...res.preferences,
      })
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
          {user.email} · {formatRoleLabel(user.role)}
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

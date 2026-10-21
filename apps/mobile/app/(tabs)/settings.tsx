import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Platform, ScrollView, Switch, View } from "react-native"
import { Redirect, useRouter } from "expo-router"
import { useFocusEffect } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_META,
  formatRoleLabel,
  normalizeSwimCloudIdInput,
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
  TextField,
  Title,
} from "@swimbuzz/ui"
import { colors, spacing } from "@swimbuzz/tokens"
import { api } from "../../src/lib/api"
import { useAuth } from "../../src/lib/auth"
import { registerForPushNotifications } from "../../src/lib/push"

type OwnAthlete = {
  id: string
  preferredName: string
  swimCloudId: string
}

export default function SettingsScreen() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pushStatus, setPushStatus] = useState<string | null>(null)
  const [preferredName, setPreferredName] = useState("")
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
    const nextPreferredName =
      typeof athleteDetail.preferredName === "string" ? athleteDetail.preferredName : ""
    const nextSwimCloud =
      athleteDetail.swimCloudId == null || athleteDetail.swimCloudId === ""
        ? ""
        : String(athleteDetail.swimCloudId)
    return {
      id: String(athleteDetail.id ?? match.id),
      preferredName: nextPreferredName,
      swimCloudId: nextSwimCloud,
    }
  }, [match, athleteDetail])

  useEffect(() => {
    setPreferredName(ownAthlete?.preferredName ?? "")
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
      const body: Record<string, unknown> = {
        preferredName: preferredName.trim() || null,
      }
      const trimmedId = swimCloudId.trim()
      body.swimCloudId = trimmedId === "" ? null : trimmedId
      await api.updateAthlete(ownAthlete.id, body)
      Alert.alert(
        "Saved",
        "Profile changes submitted. Preferred name and SwimCloud updates may need coach approval."
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
              label="Preferred name"
              value={preferredName}
              onChangeText={setPreferredName}
              placeholder="Optional"
              autoCapitalize="words"
            />
            <TextField
              label="SwimCloud ID or URL"
              value={swimCloudId}
              onChangeText={(text) => setSwimCloudId(normalizeSwimCloudIdInput(text))}
              placeholder="Optional"
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
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
            ({ athletesOnly, meetDirectorsOnly }) =>
              (!athletesOnly || isAthlete) &&
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

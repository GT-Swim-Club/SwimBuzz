import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Platform, Switch, View } from "react-native"
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
  ScrollView,
  Section,
  TextField,
  usePalette,
} from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { Icon } from "../../src/components/Icon"
import { SegmentedOption, SegmentedToggle } from "../../src/components/SegmentedToggle"
import { api } from "../../src/lib/api"
import { useTabBarScrollPadding } from "../../src/lib/tab-bar"
import { useAuth } from "../../src/lib/auth"
import { registerForPushNotifications } from "../../src/lib/push"
import {
  useThemePreference,
  type ThemePreference,
} from "../../src/lib/theme"
import { useViewPreferences } from "../../src/lib/view-preferences"

type OwnAthlete = {
  id: string
  nicknames: string[]
  swimCloudId: string
}

export default function SettingsScreen() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const { preference, setPreference } = useThemePreference()
  const {
    defaultView,
    defaultPracticesView,
    setDefaultView,
    setDefaultPracticesView,
  } = useViewPreferences()
  const queryClient = useQueryClient()
  const [pushStatus, setPushStatus] = useState<string | null>(null)
  const [nicknames, setNicknames] = useState("")
  const [swimCloudId, setSwimCloudId] = useState("")
  const [savingAthlete, setSavingAthlete] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const lastSaved = useRef(preferences)
  const requestGen = useRef<Partial<Record<NotificationPreferenceKey, number>>>({})

  const email = user?.email?.trim().toLowerCase() ?? null

  // Shares the ["athletes"] / ["athlete", id] / ["notification-preferences"]
  // cache with (tabs)/settings.tsx, the roster screens, and you/index.tsx.
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
  const { data: athleteDetail, isPending: athleteDetailPending } = useQuery({
    queryKey: ["athlete", match?.id],
    queryFn: () => api.getAthlete(match!.id),
    enabled: Boolean(match?.id),
  })
  const { data: prefRes, isPending: prefsPending } = useQuery({
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
      const next = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...prefRes.preferences }
      lastSaved.current = next
      setPreferences(next)
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

  function togglePreference(
    key: NotificationPreferenceKey,
    value: boolean
  ) {
    setPreferences((prev) => ({ ...prev, [key]: value }))
    const gen = (requestGen.current[key] ?? 0) + 1
    requestGen.current[key] = gen

    void (async () => {
      try {
        const res = await api.updateNotificationPreferences({ [key]: value })
        if (requestGen.current[key] !== gen) return
        lastSaved.current = {
          ...lastSaved.current,
          [key]: res.preferences[key],
        }
        queryClient.setQueryData(["notification-preferences"], res)
      } catch (err) {
        if (requestGen.current[key] !== gen) return
        setPreferences((prev) => ({
          ...prev,
          [key]: lastSaved.current[key],
        }))
        Alert.alert(
          "Could not update preference",
          err instanceof Error ? err.message : "Something went wrong"
        )
      }
    })()
  }

  const isAthlete = Boolean(ownAthlete) || user.role === "ATHLETE"

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPad }}>
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
          <Section
            title="Athlete profile"
            icon={<Icon color={c.textTertiary} name="idCard" size={18} />}
          >
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

        <Section
          title="Notification preferences"
          icon={<Icon color={c.textTertiary} name="bell" size={18} />}
        >
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
                borderBottomColor: c.border,
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
                onValueChange={(value) => togglePreference(key, value)}
                trackColor={{
                  false: c.switchTrack,
                  true: c.primary,
                }}
                thumbColor={c.switchThumb}
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

        <Section
          title="Appearance"
          icon={<Icon color={c.textTertiary} name="palette" size={18} />}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "600" }}>Theme</Body>
              <Muted>Light, dark, or match your device</Muted>
            </View>
            <SegmentedToggle
              selectedIndex={
                preference === "light" ? 1 : preference === "dark" ? 2 : 0
              }
            >
              {(
                [
                  ["system", "System", "monitor"],
                  ["light", "Light", "sun"],
                  ["dark", "Dark", "moon"],
                ] as const
              ).map(([value, label, icon]) => (
                <SegmentedOption
                  key={value}
                  accessibilityLabel={label}
                  selected={preference === value}
                  onPress={() => void setPreference(value as ThemePreference)}
                >
                  <Icon
                    color={preference === value ? c.primaryText : c.textSecondary}
                    name={icon}
                    size={16}
                  />
                </SegmentedOption>
              ))}
            </SegmentedToggle>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "600" }}>Roster, Meets, Nationals</Body>
              <Muted>Gallery or List view</Muted>
            </View>
            <SegmentedToggle selectedIndex={defaultView === "list" ? 1 : 0}>
              <SegmentedOption
                accessibilityLabel="Gallery View"
                selected={defaultView === "gallery"}
                onPress={() =>
                  void setDefaultView("gallery").catch((err) =>
                    Alert.alert(
                      "Could not update view",
                      err instanceof Error ? err.message : "Something went wrong"
                    )
                  )
                }
              >
                <Icon
                  color={defaultView === "gallery" ? c.primaryText : c.textSecondary}
                  name="gallery"
                  size={16}
                />
              </SegmentedOption>
              <SegmentedOption
                accessibilityLabel="List View"
                selected={defaultView === "list"}
                onPress={() =>
                  void setDefaultView("list").catch((err) =>
                    Alert.alert(
                      "Could not update view",
                      err instanceof Error ? err.message : "Something went wrong"
                    )
                  )
                }
              >
                <Icon
                  color={defaultView === "list" ? c.primaryText : c.textSecondary}
                  name="list"
                  size={16}
                />
              </SegmentedOption>
            </SegmentedToggle>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "600" }}>Practices</Body>
              <Muted>Weekly, Monthly, or List view</Muted>
            </View>
            <SegmentedToggle
              selectedIndex={
                defaultPracticesView === "month"
                  ? 1
                  : defaultPracticesView === "list"
                    ? 2
                    : 0
              }
            >
              {(
                [
                  ["week", "Week", "calendarWeek"],
                  ["month", "Month", "calendarMonth"],
                  ["list", "List", "list"],
                ] as const
              ).map(([value, label, icon]) => (
                <SegmentedOption
                  key={value}
                  accessibilityLabel={`${label} View`}
                  selected={defaultPracticesView === value}
                  onPress={() =>
                    void setDefaultPracticesView(value).catch((err) =>
                      Alert.alert(
                        "Could not update view",
                        err instanceof Error ? err.message : "Something went wrong"
                      )
                    )
                  }
                >
                  <Icon
                    color={
                      defaultPracticesView === value
                        ? c.primaryText
                        : c.textSecondary
                    }
                    name={icon}
                    size={16}
                  />
                </SegmentedOption>
              ))}
            </SegmentedToggle>
          </View>
        </Section>

        <Button
          label="Sign out"
          variant="danger"
          onPress={async () => {
            await signOut()
            router.replace("/welcome")
          }}
        />
      </ScrollView>
    </Screen>
  )
}

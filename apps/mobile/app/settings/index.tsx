import { useCallback, useRef, useState } from "react"
import { Alert, Platform, Switch, View } from "react-native"
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
  const lastSaved = useRef(preferences)
  const requestGen = useRef<Partial<Record<NotificationPreferenceKey, number>>>({})

  const load = useCallback(async () => {
    if (!user) return
    setError(null)
    try {
      const [athletes, prefRes] = await Promise.all([
        api.listAthletes(),
        api.getNotificationPreferences().catch(() => null),
      ])

      if (prefRes?.preferences) {
        const next = {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...prefRes.preferences,
        }
        lastSaved.current = next
        setPreferences(next)
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

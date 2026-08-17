import { Redirect, useFocusEffect, useRouter } from "expo-router"
import { useCallback, useMemo, useState } from "react"
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native"
import { formatRoleLabel, type IconName } from "@swimbuzz/shared"
import { LoadingBlock, Screen, ScrollView, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { Icon } from "../../../src/components/Icon"
import { UserAvatar } from "../../../src/components/UserAvatar"

type MenuItem = {
  title: string
  icon: IconName
  onPress: () => void
}

export default function YouScreen() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const c = usePalette()
  const styles = useMemo(() => makeYouStyles(c), [c])
  const tabBarPad = useTabBarScrollPadding()
  const [athleteId, setAthleteId] = useState<string | null>(null)
  const [swimCloudId, setSwimCloudId] = useState<number | null>(null)
  const [loadedForEmail, setLoadedForEmail] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!user) return
      if (!user.email) {
        setAthleteId(null)
        setSwimCloudId(null)
        setLoadedForEmail("")
        return
      }
      const email = user.email.trim().toLowerCase()
      let active = true
      void api
        .listAthletes()
        .then(async (athletes) => {
          const match = athletes.find(
            (athlete) => athlete.user?.email?.trim().toLowerCase() === email
          )
          if (!match) {
            if (active) {
              setAthleteId(null)
              setSwimCloudId(null)
              setLoadedForEmail(email)
            }
            return
          }
          const detail = await api.getAthlete(match.id)
          if (!active) return
          setAthleteId(match.slug ?? match.id)
          const raw = detail.swimCloudId
          const parsed =
            typeof raw === "number"
              ? raw
              : typeof raw === "string" && raw.trim()
                ? Number(raw)
                : null
          setSwimCloudId(parsed != null && Number.isFinite(parsed) ? parsed : null)
          setLoadedForEmail(email)
        })
        .catch(() => {
          if (active) {
            setAthleteId(null)
            setSwimCloudId(null)
            setLoadedForEmail(email)
          }
        })
      return () => {
        active = false
      }
    }, [user, user?.email])
  )

  const profileReady = Boolean(
    user && (user.email ? loadedForEmail === user.email.trim().toLowerCase() : loadedForEmail === "")
  )

  async function handleSignOut() {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out of SwimBuzz?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await signOut()
            router.replace("/welcome")
          },
        },
      ]
    )
  }

  if (!loading && !user) return <Redirect href="/welcome" />
  if (loading || !user || !profileReady) {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <LoadingBlock />
      </Screen>
    )
  }

  const items: MenuItem[] = [
    ...(athleteId
      ? [
          {
            title: "Profile",
            icon: "user" as const,
            onPress: () => router.push(`/roster/${athleteId}`),
          },
        ]
      : []),
    ...(swimCloudId
      ? [
          {
            title: "SwimCloud Profile",
            icon: "externalLink" as const,
            onPress: () => {
              void Linking.openURL(
                `https://www.swimcloud.com/swimmer/${swimCloudId}/`
              )
            },
          },
        ]
      : []),
    {
      title: "Settings",
      icon: "settings",
      onPress: () => router.push("/settings"),
    },
  ]

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPad }}>
      <View style={styles.accountCard}>
        <UserAvatar
          image={user.image}
          name={user.name}
          email={user.email}
          size={48}
        />
        <View style={styles.accountCopy}>
          <Text numberOfLines={1} style={styles.accountName}>
            {user.name || "Account"}
          </Text>
          <Text numberOfLines={1} style={styles.accountMeta}>
            {user.email || formatRoleLabel(user.role)}
          </Text>
          {user.email ? (
            <Text numberOfLines={1} style={styles.accountRole}>
              {formatRoleLabel(user.role)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.menuCard}>
        {items.map((item, index) => (
          <Pressable
            key={item.title}
            accessibilityRole="button"
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.row,
              index < items.length - 1 && styles.rowDivider,
              pressed && styles.rowPressed,
            ]}
          >
            <Icon color={c.textTertiary} name={item.icon} size={20} />
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Icon color={c.textTertiary} name="chevronRight" size={18} />
          </Pressable>
        ))}
      </View>

      <View style={[styles.menuCard, styles.signOutCard]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Icon color={c.textTertiary} name="logOut" size={20} />
          <Text style={styles.rowTitle}>Sign Out</Text>
        </Pressable>
      </View>
      </ScrollView>
    </Screen>
  )
}

function makeYouStyles(c: ColorPalette) {
  return StyleSheet.create({
  accountCard: {
    alignItems: "center",
    backgroundColor: c.bgContainer,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  accountCopy: { flex: 1, marginLeft: spacing.sm, minWidth: 0 },
  accountName: { color: c.text, fontSize: 16, fontWeight: "700" },
  accountMeta: { color: c.textSecondary, fontSize: 13, marginTop: 2 },
  accountRole: { color: c.textTertiary, fontSize: 12, marginTop: 2 },
  menuCard: {
    backgroundColor: c.bgContainer,
    borderColor: c.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  signOutCard: { marginTop: spacing.md },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomColor: c.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: { backgroundColor: c.fillSecondary },
  rowTitle: { color: c.text, flex: 1, fontSize: 15 },
  })
}

import { Redirect, useRouter } from "expo-router"
import { useMemo } from "react"
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native"
import { useQuery } from "@tanstack/react-query"
import { formatRoleLabel, STAFF_TITLE_LABELS, type IconName } from "@swimbuzz/shared"
import { LoadingBlock, Screen, ScrollView, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { Icon } from "../../../src/components/Icon"
import { StaffBadge } from "../../../src/components/StaffBadge"
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
  const email = user?.email?.trim().toLowerCase() ?? null

  // Shares the ["athletes"] / ["athlete", id] cache with the roster screens —
  // if the roster was already loaded, this resolves instantly.
  const { data: athletes = [], isPending: athletesPending } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.listAthletes(),
    enabled: Boolean(email),
  })
  const match = useMemo(
    () =>
      email
        ? athletes.find((athlete) => athlete.user?.email?.trim().toLowerCase() === email)
        : undefined,
    [athletes, email]
  )
  const { data: athleteDetail, isPending: detailPending } = useQuery({
    queryKey: ["athlete", match?.id],
    queryFn: () => api.getAthlete(match!.id),
    enabled: Boolean(match?.id),
  })

  const athleteId = match ? (match.slug ?? match.id) : null
  const swimCloudId = (() => {
    const raw = athleteDetail?.swimCloudId
    const parsed =
      typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : null
    return parsed != null && Number.isFinite(parsed) ? parsed : null
  })()

  const profileReady = !user
    ? false
    : !email
      ? true
      : !athletesPending && (!match || !detailPending)

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text numberOfLines={1} style={styles.accountName}>
              {user.name || "Account"}
            </Text>
            {user.staffTitle ? <StaffBadge title={user.staffTitle} /> : null}
          </View>
          <Text numberOfLines={1} style={styles.accountMeta}>
            {user.email || formatRoleLabel(user.role)}
          </Text>
          {user.email ? (
            <Text numberOfLines={1} style={styles.accountRole}>
              {user.staffTitle ? STAFF_TITLE_LABELS[user.staffTitle] : formatRoleLabel(user.role)}
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

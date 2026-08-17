import { useMemo } from "react"
import { Redirect, useRouter } from "expo-router"
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import type { IconName } from "@swimbuzz/shared"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { ScrollView, usePalette } from "@swimbuzz/ui"
import { useAuth } from "../src/lib/auth"
import { Icon } from "../src/components/Icon"

type FeatureItem = {
  title: string
  description: string
}

const athleteFeatures: FeatureItem[] = [
  {
    title: "Browse the roster",
    description: "See who's swimming this season and get to a teammate's profile quickly.",
  },
  {
    title: "Track personal bests",
    description: "Look up your best times, meet results, and teammates' swims.",
  },
  {
    title: "Follow meets",
    description: "Find dates, entries, heat sheets, travel info, and livestreams.",
  },
  {
    title: "See Nationals qualifiers",
    description: "See who has qualified this season.",
  },
  {
    title: "Read practice plans",
    description: "Read the workout, intervals, and notes before you get to the pool.",
  },
]

const coachFeatures: FeatureItem[] = [
  {
    title: "Keep the roster up to date",
    description: "Import a roster, update profiles, and pull in new times when you need to.",
  },
  {
    title: "Set up meets",
    description: "Add meet info, share the files swimmers need, and manage entries.",
  },
  {
    title: "Write practices",
    description: "Write the plan once and publish it for the team.",
  },
  {
    title: "Plan relays",
    description: "Try lineups using personal bests and signup interest.",
  },
  {
    title: "Nationals tracking",
    description: "Upload the standards and see who has made the cut.",
  },
]

export default function WelcomeScreen() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const c = usePalette()
  const styles = useMemo(() => makeWelcomeStyles(c), [c])

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.primaryActive} />
      </View>
    )
  }

  if (user) return <Redirect href="/practices" />

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Georgia Tech Swim Club</Text>
          <Text style={styles.title}>SwimBuzz.</Text>
          <Text style={styles.subtitle}>
            Meet, practice, and times management—all in one place.
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/sign-in")}
              style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryActionText}>Sign in</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/sign-in")}
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryPressed]}
            >
              <Text style={styles.secondaryActionText}>Go to meets</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.cards}>
          <RoleCard
            icon="userRound"
            title="Athletes"
            subtitle="Your schedule, times, and meet details"
            items={athleteFeatures}
            emphasized={false}
          />
          <RoleCard
            icon="graduationCap"
            title="Coaches"
            subtitle="Rosters, practices, and meet info"
            items={coachFeatures}
            emphasized
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function RoleCard({
  icon,
  title,
  subtitle,
  items,
  emphasized,
}: {
  icon: IconName
  title: string
  subtitle: string
  items: FeatureItem[]
  emphasized: boolean
}) {
  const c = usePalette()
  const styles = useMemo(() => makeWelcomeStyles(c), [c])
  return (
    <View style={[styles.card, emphasized && styles.cardEmphasized]}>
      <View style={styles.cardHeader}>
        <View style={styles.featureIcon}>
          <Icon color={c.primaryActive} name={icon} size={20} strokeWidth={1.75} />
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.itemList}>
        {items.map((item) => (
          <View key={item.title} style={styles.item}>
            <View style={styles.dot} />
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDescription}>{item.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function withAlpha(hex: string, alpha: number) {
  const n = hex.replace("#", "")
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function makeWelcomeStyles(c: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgLayout },
    loading: {
      alignItems: "center",
      backgroundColor: c.bgLayout,
      flex: 1,
      justifyContent: "center",
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.md,
    },
    hero: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingBottom: spacing.xl,
      paddingTop: spacing.lg,
    },
    eyebrow: {
      color: c.primaryActive,
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    title: {
      color: c.text,
      fontSize: 40,
      fontWeight: "600",
      letterSpacing: -0.8,
      lineHeight: 46,
      marginTop: spacing.sm,
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      marginTop: spacing.md,
    },
    actions: { gap: spacing.sm, marginTop: spacing.xl },
    primaryAction: {
      alignItems: "center",
      backgroundColor: c.primary,
      borderRadius: radii.lg,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: spacing.lg,
    },
    primaryPressed: { backgroundColor: c.primaryHover, opacity: 0.92 },
    primaryActionText: { color: c.primaryText, fontSize: 14, fontWeight: "600" },
    secondaryAction: {
      alignItems: "center",
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: spacing.lg,
    },
    secondaryPressed: { backgroundColor: c.fillSecondary },
    secondaryActionText: { color: c.textSecondary, fontSize: 14, fontWeight: "600" },
    cards: { gap: spacing.md, marginTop: spacing.lg },
    card: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: 16,
      borderWidth: 1,
      padding: 20,
    },
    cardEmphasized: {
      backgroundColor: withAlpha(c.primary, 0.05),
      borderColor: withAlpha(c.primary, 0.2),
    },
    cardHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
    featureIcon: {
      alignItems: "center",
      backgroundColor: c.primaryBg,
      borderRadius: radii.md,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    cardHeaderCopy: { flex: 1 },
    cardTitle: { color: c.text, fontSize: 18, fontWeight: "600" },
    cardSubtitle: { color: c.textTertiary, fontSize: 13, marginTop: 2 },
    itemList: { gap: spacing.md, marginTop: spacing.md },
    item: { flexDirection: "row", gap: spacing.sm },
    dot: {
      backgroundColor: c.primary,
      borderRadius: 3,
      height: 6,
      marginTop: 7,
      width: 6,
    },
    itemCopy: { flex: 1 },
    itemTitle: { color: c.text, fontSize: 14, fontWeight: "600" },
    itemDescription: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 2,
    },
  })
}

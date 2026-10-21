import { useMemo, useState } from "react"
import { Alert, Pressable, StyleSheet, Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import {
  groupRelayLineups,
  relayLineupHasAthlete,
  relayLineupRoundLabel,
  type RelayLineup,
} from "@swimbuzz/shared"
import {
  Button,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Muted,
  Screen,
  ScrollView,
  Title,
  usePalette,
} from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../../src/lib/tab-bar"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

export default function MeetRelaysScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const tabBarPad = useTabBarScrollPadding()
  const [removingKey, setRemovingKey] = useState<string | null>(null)

  // Same query key as the meet screen, so opening Relays from there is instant.
  const { data: meet, isPending, error, refetch } = useQuery({
    queryKey: ["meet", id] as const,
    queryFn: () => api.getMeet(id as string),
    enabled: Boolean(id),
  })

  const viewer = asRecord(meet?.viewer)
  const isStaff = Boolean(viewer?.isStaff)
  const viewerAthleteId = viewer?.athleteId ? String(viewer.athleteId) : null
  const lineups = useMemo(
    () => (Array.isArray(meet?.relayLineups) ? (meet.relayLineups as RelayLineup[]) : []),
    [meet]
  )
  const groups = useMemo(() => groupRelayLineups(lineups), [lineups])

  async function removeRelay(relay: RelayLineup) {
    if (!id) return
    setRemovingKey(relay.key)
    try {
      await api.deleteRelayTeam(id, {
        event: relay.event,
        relayLetter: relay.letter,
        relayRound: relay.round,
        gender: relay.gender,
      })
      await refetch()
    } catch (err) {
      Alert.alert(
        "Could not remove relay",
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setRemovingKey(null)
    }
  }

  function confirmRemove(relay: RelayLineup) {
    Alert.alert("Remove relay?", `Remove the ${relay.event} ${relay.letter} relay from the roster summary.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void removeRelay(relay) },
    ])
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPad }}>
        <Title>{typeof meet?.name === "string" ? meet.name : "Meet"}</Title>
        <Text style={styles.eyebrow}>RELAYS</Text>

        {error ? (
          <ErrorBlock message={error instanceof Error ? error.message : "Failed to load relays"} />
        ) : null}

        {groups.length === 0 ? (
          <EmptyState title="No relays yet" body="Relays added to the roster summary show up here." />
        ) : (
          groups.map((group) => (
            <View key={group.gender || "other"} style={styles.genderGroup}>
              <Text style={styles.genderLabel}>{group.label.toUpperCase()}</Text>
              {group.events.map((eventGroup) => (
                <View key={`${eventGroup.eventNumber}-${eventGroup.event}`} style={styles.eventGroup}>
                  <Text style={styles.eventTitle}>
                    {eventGroup.eventNumber > 0 ? (
                      <Text style={styles.eventNumber}>{`#${eventGroup.eventNumber}  `}</Text>
                    ) : null}
                    {eventGroup.event}
                  </Text>
                  {eventGroup.relays.map((relay) => {
                    const mine = relayLineupHasAthlete(relay, viewerAthleteId)
                    const roundLabel = relayLineupRoundLabel(relay.round)
                    const time = relay.resultTime ?? relay.seedTime
                    const timeLabel = relay.resultTime
                      ? relay.place != null
                        ? `#${relay.place}`
                        : "Final"
                      : "Seed"
                    return (
                      <View key={relay.key} style={[styles.card, mine && styles.cardMine]}>
                        <View style={styles.cardHeader}>
                          <View style={styles.cardHeaderLeft}>
                            <Text style={styles.cardTitle}>{`${relay.letter} Relay`}</Text>
                            {roundLabel ? <Text style={styles.pill}>{roundLabel}</Text> : null}
                            {mine ? (
                              <Text style={[styles.pill, styles.pillMine]}>Your relay</Text>
                            ) : null}
                          </View>
                          {time ? (
                            <Text style={styles.time}>
                              <Text style={styles.timeLabel}>{`${timeLabel}  `}</Text>
                              {time}
                            </Text>
                          ) : null}
                        </View>
                        {relay.legs.length > 0 ? (
                          relay.legs.map((leg) => {
                            const isViewer =
                              Boolean(viewerAthleteId) && leg.athleteId === viewerAthleteId
                            const slug = leg.athleteSlug
                            return (
                              <Pressable
                                key={leg.leg}
                                disabled={!slug}
                                accessibilityRole={slug ? "button" : undefined}
                                accessibilityLabel={slug ? `View ${leg.name}'s profile` : undefined}
                                onPress={() => slug && router.push(`/roster/${slug}`)}
                                style={({ pressed }) => [
                                  styles.legRow,
                                  pressed && slug ? styles.legRowPressed : null,
                                ]}
                              >
                                <View style={styles.legBadge}>
                                  <Text style={styles.legBadgeText}>{leg.leg}</Text>
                                </View>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.legName,
                                    !slug && styles.legNameMuted,
                                    isViewer && styles.legNameMine,
                                  ]}
                                >
                                  {leg.name}
                                </Text>
                                {leg.stroke ? <Text style={styles.legStroke}>{leg.stroke}</Text> : null}
                              </Pressable>
                            )
                          })
                        ) : (
                          <Muted style={styles.noLineup}>Lineup not set yet</Muted>
                        )}
                        {isStaff && relay.manual ? (
                          <View style={styles.cardFooter}>
                            <Button
                              label="Remove"
                              variant="danger"
                              loading={removingKey === relay.key}
                              disabled={removingKey !== null && removingKey !== relay.key}
                              onPress={() => confirmRemove(relay)}
                            />
                          </View>
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    eyebrow: {
      color: c.primaryActive,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1,
      marginBottom: spacing.md,
      marginTop: spacing.xxs,
    },
    genderGroup: { marginBottom: spacing.lg },
    genderLabel: {
      color: c.primaryActive,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1,
      marginBottom: spacing.sm,
    },
    eventGroup: { marginBottom: spacing.md, gap: spacing.xs },
    eventTitle: { color: c.text, fontSize: 15, fontWeight: "600" },
    eventNumber: { color: c.textSecondary, fontWeight: "500" },
    card: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: "hidden",
    },
    cardMine: { borderColor: c.primary, borderWidth: 2 },
    cardHeader: {
      alignItems: "center",
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cardHeaderLeft: { alignItems: "center", flexDirection: "row", flexShrink: 1, flexWrap: "wrap", gap: spacing.xs },
    cardTitle: { color: c.text, fontSize: 16, fontWeight: "600" },
    pill: {
      borderColor: c.border,
      borderRadius: 999,
      borderWidth: 1,
      color: c.textSecondary,
      fontSize: 11,
      fontWeight: "600",
      overflow: "hidden",
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
    },
    pillMine: { backgroundColor: c.primaryBg, borderColor: c.primaryBorder, color: c.primaryActive },
    time: { color: c.text, fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "600" },
    timeLabel: { color: c.textSecondary, fontSize: 12, fontWeight: "400" },
    legRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    legRowPressed: { backgroundColor: c.bgHover },
    legBadge: {
      alignItems: "center",
      backgroundColor: c.primaryBg,
      borderColor: c.primaryBorder,
      borderRadius: radii.xs,
      borderWidth: 1,
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    legBadgeText: { color: c.primaryActive, fontSize: 12, fontWeight: "600" },
    legName: { color: c.text, flex: 1, fontSize: 14, fontWeight: "500" },
    legNameMuted: { color: c.textSecondary },
    legNameMine: { color: c.primaryActive, fontWeight: "700" },
    legStroke: { color: c.textSecondary, fontSize: 12 },
    noLineup: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    cardFooter: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      padding: spacing.sm,
    },
  })
}

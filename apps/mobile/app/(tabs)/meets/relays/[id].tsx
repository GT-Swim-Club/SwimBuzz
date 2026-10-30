import { useEffect, useMemo, useRef, useState } from "react"
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import * as MediaLibrary from "expo-media-library"
import * as Sharing from "expo-sharing"
import { File, Paths } from "expo-file-system"
import { captureRef } from "react-native-view-shot"
import {
  groupRelayLineups,
  relayLineupHasAthlete,
  relayLineupRoundLabel,
  relayShareEvents,
  relayShareFilename,
  type RelayLineup,
} from "@swimbuzz/shared"
import {
  ActionSheet,
  Body,
  Button,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Muted,
  Screen,
  ScrollView,
  Title,
  usePalette,
  type ActionSheetItem,
} from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api, API_URL, getAccessToken } from "../../../../src/lib/api"
import { useTabBarScrollPadding } from "../../../../src/lib/tab-bar"
import { isExternalUrl } from "../../../../src/lib/href"
import { Icon } from "../../../../src/components/Icon"
import { RelaysExportCapture } from "../../../../src/components/RelaysExportCapture"

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
  const shareEvents = useMemo(() => relayShareEvents(groups), [groups])
  const meetName = typeof meet?.name === "string" ? meet.name : "Meet"
  const iconUrl =
    typeof meet?.iconUrl === "string" && isExternalUrl(meet.iconUrl) ? meet.iconUrl.trim() : null

  const [shareOpen, setShareOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState<"copy" | "photos" | "pdf" | null>(null)
  const [copied, setCopied] = useState(false)
  const [savedToastVisible, setSavedToastVisible] = useState(false)
  const exportCaptureRef = useRef<View>(null)
  const shareSheetDismissRef = useRef<(() => void) | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      if (savedToastTimeoutRef.current) clearTimeout(savedToastTimeoutRef.current)
    }
  }, [])

  /**
   * Closes the share sheet and waits for it to finish dismissing — iOS won't present
   * another native sheet over a modal that's still animating closed (same as practices).
   */
  function closeShareSheetAndWait(): Promise<void> {
    setShareOpen(false)
    if (Platform.OS !== "ios") return Promise.resolve()
    return new Promise((resolve) => {
      const finish = () => {
        shareSheetDismissRef.current = null
        clearTimeout(fallback)
        resolve()
      }
      const fallback = setTimeout(finish, 600)
      shareSheetDismissRef.current = finish
    })
  }

  async function copyPng() {
    if (!exportCaptureRef.current) return
    setShareBusy("copy")
    try {
      const base64 = await captureRef(exportCaptureRef, { format: "png", quality: 1, result: "base64" })
      await Clipboard.setImageAsync(base64)
      setCopied(true)
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      Alert.alert("Could not copy image", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  async function saveToPhotos() {
    if (!exportCaptureRef.current) return
    setShareBusy("photos")
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true)
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo access in Settings to save relay images.")
        return
      }
      const uri = await captureRef(exportCaptureRef, { format: "png", quality: 1, result: "tmpfile" })
      await MediaLibrary.saveToLibraryAsync(uri)
      await closeShareSheetAndWait()
      setSavedToastVisible(true)
      if (savedToastTimeoutRef.current) clearTimeout(savedToastTimeoutRef.current)
      savedToastTimeoutRef.current = setTimeout(() => setSavedToastVisible(false), 2000)
    } catch (err) {
      Alert.alert("Could not save image", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

  async function sharePdf() {
    if (!id) return
    setShareBusy("pdf")
    try {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/api/meets/${encodeURIComponent(id)}/relays/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error("Could not create PDF")
      const bytes = new Uint8Array(await res.arrayBuffer())
      const file = new File(Paths.cache, relayShareFilename(meetName, "pdf"))
      if (file.exists) file.delete()
      file.write(bytes)
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't open the share sheet.")
        return
      }
      await closeShareSheetAndWait()
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
    } catch (err) {
      Alert.alert("Could not share PDF", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setShareBusy(null)
    }
  }

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
        <View style={styles.titleRow}>
          <Title style={{ flex: 1 }}>{meetName}</Title>
          {shareEvents.length > 0 ? (
            <Pressable
              onPress={() => setShareOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Share relays"
              hitSlop={8}
              style={{ paddingVertical: spacing.xxs, paddingHorizontal: spacing.xs }}
            >
              <Icon name="share" size={22} color={c.text} />
            </Pressable>
          ) : null}
        </View>
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

      <ActionSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onDismiss={() => shareSheetDismissRef.current?.()}
        title="Share relays"
        groups={[
          [
            {
              key: "copy",
              label: copied ? "Copied" : "Copy PNG",
              icon: <Icon name={copied ? "check" : "copy"} size={20} color={c.text} />,
              busy: shareBusy === "copy",
              disabled: Boolean(shareBusy) && shareBusy !== "copy",
              onPress: () => void copyPng(),
            },
            {
              key: "photos",
              label: "Save to Photos",
              icon: <Icon name="image" size={20} color={c.text} />,
              busy: shareBusy === "photos",
              disabled: Boolean(shareBusy) && shareBusy !== "photos",
              onPress: () => void saveToPhotos(),
            },
            {
              key: "pdf",
              label: "Share PDF",
              icon: <Icon name="fileText" size={20} color={c.text} />,
              busy: shareBusy === "pdf",
              disabled: Boolean(shareBusy) && shareBusy !== "pdf",
              onPress: () => void sharePdf(),
            },
          ] satisfies ActionSheetItem[],
        ]}
      />

      {/* Off-screen mirror captured to PNG — never shown in the layout. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: -10000 }}>
        <RelaysExportCapture ref={exportCaptureRef} meetName={meetName} iconUrl={iconUrl} events={shareEvents} />
      </View>

      {savedToastVisible ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, bottom: tabBarPad, alignItems: "center" }}
        >
          <View style={styles.toast}>
            <Icon name="check" size={16} color={c.primaryActive} />
            <Body style={{ fontWeight: "600" }}>Saved to Photos</Body>
          </View>
        </View>
      ) : null}
    </Screen>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bgElevated,
      borderColor: c.border,
      borderWidth: 1,
    },
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

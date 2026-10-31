import { forwardRef, useEffect, useRef, useState } from "react"
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import {
  relayLineupRoundLabel,
  relayShareTime,
  type MeetHeaderDetails,
  type RelayShareEvent,
} from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { MeetExportHeader } from "./MeetExportHeader"

const MAX_COLUMNS = 6
const COLUMN_GAP = spacing.md
/** Keeps a long meet name from wrapping word by word when there are only a few narrow columns. */
const MIN_CAPTURE_WIDTH = 640
/** Breathing room added to the widest block so names don't sit against the border. */
const EXTRA_COLUMN_WIDTH = 24
/** Room for the measuring pass, so no event block is squeezed while it's measured. */
const MEASURE_WIDTH = 2000

/**
 * Off-screen copy of the published relays, rendered at a fixed width for
 * react-native-view-shot to capture as a PNG. Mirrors the web counterpart at
 * apps/web/src/app/meets/[id]/relays/RelaysExportCapture.tsx: every column is as
 * wide as the widest event block plus a little room, measured in a first layout pass.
 */
export const RelaysExportCapture = forwardRef<
  View,
  { meetName: string; details: MeetHeaderDetails; iconUrl: string | null; events: RelayShareEvent[] }
>(function RelaysExportCapture({ meetName, details, iconUrl, events }, ref) {
  const c = usePalette()
  const styles = makeStyles(c)
  const [columnWidth, setColumnWidth] = useState<number | null>(null)
  const measured = useRef(new Map<string, number>())
  useEffect(() => {
    measured.current.clear()
    setColumnWidth(null)
  }, [events])

  const eventKey = (event: RelayShareEvent) => `${event.number ?? ""}-${event.name}`

  function onMeasure(key: string, e: LayoutChangeEvent) {
    measured.current.set(key, e.nativeEvent.layout.width)
    if (measured.current.size === events.length) {
      setColumnWidth(Math.ceil(Math.max(...measured.current.values())) + EXTRA_COLUMN_WIDTH)
    }
  }

  const columns = Math.max(1, Math.min(MAX_COLUMNS, events.length))
  const gridWidth = columnWidth == null ? null : columns * columnWidth + COLUMN_GAP * (columns - 1)

  const renderEvent = (event: RelayShareEvent) => (
    <>
      <View style={styles.eventHeader}>
        {event.number ? (
          <View style={styles.eventBadge}>
            <Text style={styles.eventBadgeText}>{event.number}</Text>
          </View>
        ) : null}
        <Text style={styles.eventName}>{event.name}</Text>
      </View>
      {event.relays.map((relay) => {
        const round = relayLineupRoundLabel(relay.round)
        return (
          <View key={relay.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {`${relay.letter} Relay${round ? ` · ${round}` : ""}`}
              </Text>
              <Text style={styles.cardTime}>{relayShareTime(relay) || "—"}</Text>
            </View>
            {relay.legs.map((leg) => (
              <Text key={leg.leg} style={styles.leg} numberOfLines={1}>
                {leg.name}
              </Text>
            ))}
          </View>
        )
      })}
    </>
  )

  if (gridWidth == null) {
    // Measuring pass: each block at its natural width.
    return (
      <View ref={ref} style={[styles.root, { width: MEASURE_WIDTH, alignItems: "flex-start" }]} collapsable={false}>
        {events.map((event) => (
          <View key={eventKey(event)} style={styles.event} onLayout={(e) => onMeasure(eventKey(event), e)}>
            {renderEvent(event)}
          </View>
        ))}
      </View>
    )
  }

  return (
    <View
      ref={ref}
      style={[styles.root, { width: Math.max(MIN_CAPTURE_WIDTH, gridWidth + spacing.xl * 2) }]}
      collapsable={false}
    >
      <MeetExportHeader eyebrow="Relays" meetName={meetName} details={details} iconUrl={iconUrl} />
      <View style={[styles.grid, { width: gridWidth }]}>
        {events.map((event) => (
          <View key={eventKey(event)} style={[styles.event, { width: columnWidth! }]}>
            {renderEvent(event)}
          </View>
        ))}
      </View>
    </View>
  )
})

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: {
      padding: spacing.xl,
      gap: spacing.lg,
      backgroundColor: c.bgLayout,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", columnGap: COLUMN_GAP, rowGap: spacing.lg },
    event: { gap: spacing.xs },
    eventHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    eventBadge: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: 22,
      height: 22,
      paddingHorizontal: 4,
      borderRadius: 11,
      borderWidth: 1,
      // Dark mode's primaryBorder is white; the web badge is gold-outlined.
      borderColor: c.accent,
      backgroundColor: c.primaryBg,
    },
    eventBadgeText: { color: c.accent, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
    eventName: { color: c.text, fontSize: 15, fontWeight: "600", flexShrink: 1 },
    card: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: 1,
      overflow: "hidden",
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 7,
      borderBottomColor: c.border,
      borderBottomWidth: 1,
    },
    cardTitle: { color: c.text, fontSize: 14, fontWeight: "600", flexShrink: 1 },
    cardTime: { color: c.text, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
    leg: { color: c.text, fontSize: 14, fontWeight: "500", paddingHorizontal: spacing.sm, paddingVertical: 5 },
  })
}

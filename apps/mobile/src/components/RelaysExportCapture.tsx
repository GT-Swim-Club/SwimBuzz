import { forwardRef, useEffect, useRef, useState } from "react"
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import {
  MEET_HEADER,
  relayLineupRoundLabel,
  relayShareTime,
  type MeetHeaderDetails,
  type RelayShareEvent,
} from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { Icon } from "./Icon"

const MAX_COLUMNS = 6
const COLUMN_GAP = spacing.md
/** Keeps a long meet name from wrapping word by word when there are only a few narrow columns. */
const MIN_CAPTURE_WIDTH = 640
/** Breathing room added to the widest block so names don't sit against the border. */
const EXTRA_COLUMN_WIDTH = 24
/** Room for the measuring pass, so no event block is squeezed while it's measured. */
const MEASURE_WIDTH = 2000

// Header, like the relays PDF's: eyebrow, meet name, then date & location, spaced by the gaps you
// see — from one row's baseline to the next row's capitals. Sizes follow the meet name's, in the
// proportions every meet header shares.
const TITLE_SIZE = 34
const EYEBROW_SIZE = TITLE_SIZE * MEET_HEADER.eyebrowSize
const DETAILS_SIZE = TITLE_SIZE * MEET_HEADER.detailsSize
const GAP_ABOVE_TITLE = TITLE_SIZE * MEET_HEADER.gapAboveTitle
const GAP_BELOW_TITLE = TITLE_SIZE * MEET_HEADER.gapBelowTitle
// System font metrics (SF Pro, Roboto) as fractions of the font size: how far below a line's top
// its capitals start, and how far below its baseline the line ends.
const CAP_TOP = 0.24
const DESCENT = 0.24
const ICON_OVERSHOOT = TITLE_SIZE * MEET_HEADER.iconOvershoot

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
  // The icon spans the header's rows: from the eyebrow's capitals to the details' baseline.
  const [headerTextHeight, setHeaderTextHeight] = useState<number | null>(null)
  const iconSize =
    headerTextHeight == null
      ? null
      : headerTextHeight - EYEBROW_SIZE * CAP_TOP - DETAILS_SIZE * DESCENT + ICON_OVERSHOOT * 2

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
      <View style={styles.header}>
        {iconUrl ? (
          <Image
            source={{ uri: iconUrl }}
            style={[styles.icon, iconSize != null && { width: iconSize, height: iconSize }]}
          />
        ) : null}
        <View style={{ flexShrink: 1 }} onLayout={(e) => setHeaderTextHeight(e.nativeEvent.layout.height)}>
          <Text style={styles.eyebrow}>RELAYS</Text>
          <Text style={styles.title}>{meetName}</Text>
          <View style={styles.details}>
            <View style={styles.detailsItem}>
              <Icon name="calendar" size={DETAILS_SIZE} color={c.textSecondary} />
              <Text style={styles.detailsText}>{details.date}</Text>
            </View>
            {details.location ? (
              <View style={[styles.detailsItem, { flexShrink: 1 }]}>
                <Icon name="mapPin" size={DETAILS_SIZE} color={c.textSecondary} />
                <Text style={[styles.detailsText, { flexShrink: 1 }]} numberOfLines={1}>
                  {details.location}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
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
    header: { flexDirection: "row", alignItems: "flex-start", gap: TITLE_SIZE * MEET_HEADER.iconGap },
    icon: { width: 72, height: 72, borderRadius: radii.lg, marginTop: EYEBROW_SIZE * CAP_TOP - ICON_OVERSHOOT },
    eyebrow: {
      color: c.accent,
      fontSize: EYEBROW_SIZE,
      fontWeight: "700",
      letterSpacing: 2,
      includeFontPadding: false,
    },
    title: {
      color: c.text,
      fontSize: TITLE_SIZE,
      fontWeight: "700",
      includeFontPadding: false,
      marginTop: GAP_ABOVE_TITLE - EYEBROW_SIZE * DESCENT - TITLE_SIZE * CAP_TOP,
    },
    details: {
      flexDirection: "row",
      alignItems: "center",
      columnGap: spacing.md,
      marginTop: GAP_BELOW_TITLE - TITLE_SIZE * DESCENT - DETAILS_SIZE * CAP_TOP,
    },
    detailsItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    detailsText: { color: c.textSecondary, fontSize: DETAILS_SIZE, includeFontPadding: false },
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

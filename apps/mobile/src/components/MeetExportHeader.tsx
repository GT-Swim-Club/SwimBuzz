import { useState } from "react"
import { Image, StyleSheet, Text, View } from "react-native"
import { MEET_HEADER, type MeetHeaderDetails } from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { spacing, type ColorPalette } from "@swimbuzz/tokens"
import { Icon } from "./Icon"

// Header, like the PDFs': eyebrow, meet name, then date & location, spaced by the gaps you see —
// from one row's baseline to the next row's capitals. Sizes follow the meet name's, in the
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
/** As small as a long meet name shrinks to stay on one line across the export's width. */
const TITLE_MIN_SCALE = 0.6

/**
 * A PNG export's meet header, beside the meet icon as tall as its three rows. A long meet name
 * shrinks to fit the export's width rather than wrapping.
 */
export function MeetExportHeader({
  eyebrow,
  meetName,
  details,
  iconUrl,
}: {
  eyebrow: string
  meetName: string
  /** Date and location (with the school), under the meet name. */
  details: MeetHeaderDetails
  iconUrl: string | null
}) {
  const c = usePalette()
  const styles = makeStyles(c)
  // The icon spans the header's rows: from the eyebrow's capitals to the details' baseline.
  const [headerTextHeight, setHeaderTextHeight] = useState<number | null>(null)
  const iconSize =
    headerTextHeight == null
      ? null
      : headerTextHeight - EYEBROW_SIZE * CAP_TOP - DETAILS_SIZE * DESCENT + ICON_OVERSHOOT * 2

  return (
    <View style={styles.header}>
      {iconUrl ? (
        <Image
          source={{ uri: iconUrl }}
          resizeMode="contain"
          style={[styles.icon, iconSize != null && { width: iconSize, height: iconSize }]}
        />
      ) : null}
      <View style={{ flexShrink: 1 }} onLayout={(e) => setHeaderTextHeight(e.nativeEvent.layout.height)}>
        <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={TITLE_MIN_SCALE}>
          {meetName}
        </Text>
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
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    header: { flexDirection: "row", alignItems: "flex-start", gap: TITLE_SIZE * MEET_HEADER.iconGap },
    icon: { width: 72, height: 72, marginTop: EYEBROW_SIZE * CAP_TOP - ICON_OVERSHOOT },
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
      flexWrap: "wrap",
      rowGap: spacing.xs,
      alignItems: "center",
      columnGap: spacing.md,
      marginTop: GAP_BELOW_TITLE - TITLE_SIZE * DESCENT - DETAILS_SIZE * CAP_TOP,
    },
    detailsItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    detailsText: { color: c.textSecondary, fontSize: DETAILS_SIZE, includeFontPadding: false },
  })
}

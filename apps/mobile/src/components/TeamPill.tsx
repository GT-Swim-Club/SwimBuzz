import { Text, View } from "react-native"
import type { TeamPillTone } from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import type { ColorPalette } from "@swimbuzz/tokens"

/** A tone's fill, text and border (`--brand-color-team-<tone>-*`). */
function toneColors(c: ColorPalette, tone: TeamPillTone): { bg: string; text: string; border: string } {
  switch (tone) {
    case "white":
      return { bg: c.teamWhiteBg, text: c.teamWhiteText, border: c.teamWhiteBorder }
    case "black":
      return { bg: c.teamBlackBg, text: c.teamBlackText, border: c.teamBlackBorder }
    case "blue":
      return { bg: c.teamBlueBg, text: c.teamBlueText, border: c.teamBlueBorder }
    case "green":
      return { bg: c.teamGreenBg, text: c.teamGreenText, border: c.teamGreenBorder }
    case "red":
      return { bg: c.teamRedBg, text: c.teamRedText, border: c.teamRedBorder }
    case "purple":
      return { bg: c.teamPurpleBg, text: c.teamPurpleText, border: c.teamPurpleBorder }
    case "orange":
      return { bg: c.teamOrangeBg, text: c.teamOrangeText, border: c.teamOrangeBorder }
    default:
      return { bg: c.teamGoldBg, text: c.teamGoldText, border: c.teamGoldBorder }
  }
}

/**
 * An athlete's (or relay's) team at a meet whose results name several of ours — "GOLD" — as a
 * small caps pill in the team's color, like the web summary's.
 */
export function TeamPill({ team, tone = "gold" }: { team: string; tone?: TeamPillTone }) {
  const colors = toneColors(usePalette(), tone)
  return (
    <View
      style={{
        flexShrink: 0,
        alignSelf: "center",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bg,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 10, fontWeight: "600", letterSpacing: 1 }}>
        {team.toUpperCase()}
      </Text>
    </View>
  )
}

/**
 * A team pill column's width (px): room for the longest team's caps (about 8px each at 10px with the
 * letter spacing) and the pill's padding and border — the same for every row, so the pills line up.
 */
export function teamPillColumnWidth(teams: readonly string[]): number {
  const longest = Math.max(0, ...teams.map((team) => team.length))
  return Math.ceil(longest * 8 + 16)
}

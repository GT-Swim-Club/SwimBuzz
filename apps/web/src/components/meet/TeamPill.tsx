import type { TeamPillTone } from "@swimbuzz/shared"

/**
 * An athlete's (or relay's) team at a meet whose results name several of ours — "GOLD" — as a
 * small caps pill after their name, in the team's color (`--brand-color-team-<tone>-*`).
 * `className` replaces the default gap before it (a flex row spaces it itself).
 */
export default function TeamPill({
  team,
  tone = "gold",
  className = "ml-1.5",
}: {
  team: string
  tone?: TeamPillTone
  className?: string
}) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-1.5 py-0.5 align-[0.1em] text-[10px] font-semibold uppercase leading-none tracking-[0.1em] ${className}`}
      style={{
        backgroundColor: `var(--brand-color-team-${tone}-bg)`,
        borderColor: `var(--brand-color-team-${tone}-border)`,
        color: `var(--brand-color-team-${tone}-text)`,
      }}
    >
      {team}
    </span>
  )
}

/**
 * A team pill column's width, in the pill's own em (set the column's font size to the pill's 10px):
 * room for the longest team's caps (about 0.85em each with the tracking), the padding and border.
 */
export function teamPillColumnWidth(teams: readonly string[]): string {
  const longest = Math.max(0, ...teams.map((team) => team.length))
  return `${(longest * 0.85 + 1.4).toFixed(2)}em`
}

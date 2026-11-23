import { UNOFFICIAL_MARK, unofficialLabel } from "@swimbuzz/shared"
import HoverDetail from "@/components/ui/HoverDetail"

/**
 * The gold "*" before a time from an unofficial meet (an intrasquad); hovering it names the meet.
 * Renders nothing for an official time, so it can sit before every time. It hangs off the time's
 * left edge (zero layout width), so the times stay lined up, and sits above a row's stretched link.
 */
export default function UnofficialMark({
  unofficial,
  meetName,
  className = "",
}: {
  unofficial?: boolean | null
  meetName?: string | null
  className?: string
}) {
  if (!unofficial) return null
  const label = unofficialLabel(meetName)
  return (
    <span className={`group relative z-[1] -ml-2 inline-block w-2 pr-px text-right text-accent ${className}`}>
      <span aria-hidden>{UNOFFICIAL_MARK}</span>
      <span className="sr-only">{`(${label}) `}</span>
      <HoverDetail label={label} textClassName="text-accent" />
    </span>
  )
}

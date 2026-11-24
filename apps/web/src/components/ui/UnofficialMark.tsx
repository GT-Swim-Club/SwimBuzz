import { UNOFFICIAL_MARK, unofficialLabel } from "@swimbuzz/shared"
import TimeMark from "@/components/ui/TimeMark"

/** The gold "*" before a time from an unofficial meet (an intrasquad); hovering it names the meet. */
export default function UnofficialMark({
  unofficial,
  meetName,
  className = "",
}: {
  unofficial?: boolean | null
  meetName?: string | null
  className?: string
}) {
  return <TimeMark show={unofficial} mark={UNOFFICIAL_MARK} label={unofficialLabel(meetName)} className={className} />
}

import { MANUAL_RECORD_LABEL, MANUAL_RECORD_MARK } from "@swimbuzz/shared"
import TimeMark from "@/components/ui/TimeMark"

/** The gold "*" before a record (or Top 10) time typed in by hand, with no imported swim behind it. */
export default function ManualRecordMark({ manual, className = "" }: { manual?: boolean | null; className?: string }) {
  return <TimeMark show={manual} mark={MANUAL_RECORD_MARK} label={MANUAL_RECORD_LABEL} className={className} />
}

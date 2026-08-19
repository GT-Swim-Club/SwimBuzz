import { STAFF_TITLE_LABELS, staffBadgeIcon, type StaffTitle } from "@swimbuzz/shared"
import { AppIcon } from "@/components/AppIcon"
import HoverDetail from "@/components/HoverDetail"

/**
 * Icon shown next to a coach/exec member's name — separate icon for coach vs
 * exec titles, hover/focus reveals the exact title. Follows the same
 * icon-beside-a-name-with-tooltip pattern as `AttendedBadge` in
 * apps/web/src/app/practices/[id]/CommentSection.tsx.
 */
export default function StaffBadge({
  title,
  className = "",
}: {
  title: StaffTitle
  className?: string
}) {
  const label = STAFF_TITLE_LABELS[title]
  return (
    <span
      className={`group relative ml-1.5 inline-flex translate-y-[1px] items-center text-primary ${className}`}
    >
      <AppIcon name={staffBadgeIcon(title)} className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only">{label}</span>
      <HoverDetail label={label} />
    </span>
  )
}

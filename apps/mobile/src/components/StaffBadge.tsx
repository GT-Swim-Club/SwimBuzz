import { STAFF_TITLE_LABELS, staffBadgeIcon, type StaffTitle } from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { Icon } from "./Icon"

/**
 * Icon shown next to a coach/exec member's name on mobile — separate icon
 * for coach vs exec titles. There's no hover on touch, so the exact title is
 * exposed via accessibilityLabel (screen readers) rather than a tooltip.
 */
export function StaffBadge({ title, size = 14 }: { title: StaffTitle; size?: number }) {
  const c = usePalette()
  return (
    <Icon
      name={staffBadgeIcon(title)}
      size={size}
      color={c.primary}
      strokeWidth={2}
      accessibilityLabel={STAFF_TITLE_LABELS[title]}
    />
  )
}

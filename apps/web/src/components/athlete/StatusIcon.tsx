import type { AthleteStatusIcon, AthleteStatusTone } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"

const TONE_CLASS: Record<AthleteStatusTone, string> = {
  complete: "text-success-text",
  partial: "text-warning-text",
  missing: "text-error",
}

/**
 * One status icon beside an athlete's name (physical, concussion test, SwimCloud times):
 * green / yellow / red with the status on hover. "lg" sits beside the profile heading in a
 * 32px box (clickable when `onClick` is given); "sm" is a bare 16px icon.
 */
export default function StatusIcon({
  item,
  size = "sm",
  onClick,
  actionLabel,
}: {
  item: AthleteStatusIcon
  size?: "sm" | "lg"
  onClick?: () => void
  /** What clicking does, for screen readers ("Edit clearance", "Import times"). */
  actionLabel?: string
}) {
  const tone = TONE_CLASS[item.tone]
  const icon = <AppIcon name={item.icon} className={`${size === "lg" ? "h-5 w-5" : "h-4 w-4"} shrink-0`} />
  const detail = <HoverDetail label={item.label} />

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={actionLabel ? `${item.label}. ${actionLabel}` : item.label}
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-fill-secondary ${tone}`}
      >
        {icon}
        {detail}
      </button>
    )
  }
  return (
    <span
      role="img"
      aria-label={item.label}
      className={`relative inline-flex shrink-0 items-center justify-center ${size === "lg" ? "h-8 w-8" : ""} ${tone}`}
    >
      {icon}
      {detail}
    </span>
  )
}

/**
 * Display-only status icons for roster rows and gallery cards: bare icons tightly stacked,
 * the first over the second over the third, that fan apart (no overlap) while the pointer is
 * over them. Each draws a thick stroke in the row's background color under itself (a halo,
 * invisible against the row — it follows the row's `group` hover wash) so it cuts the icon
 * beneath it cleanly; hover any one for its status.
 */
export function AthleteStatusIcons({ items, className = "" }: { items: AthleteStatusIcon[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <span className={`group/status inline-flex shrink-0 items-center ${className}`}>
      {items.map((item, index) => (
        <span
          key={item.key}
          role="img"
          aria-label={item.label}
          style={{ zIndex: items.length - index }}
          className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center transition-[margin] duration-200 ease-out ${
            index > 0 ? "-ml-2.5 group-hover/status:ml-1.5" : ""
          }`}
        >
          <AppIcon
            name={item.icon}
            strokeWidth={4.5}
            className="absolute inset-0 h-4 w-4 overflow-visible text-background transition-colors group-hover:text-background-hover"
          />
          <AppIcon name={item.icon} className={`relative h-4 w-4 overflow-visible ${TONE_CLASS[item.tone]}`} />
          <HoverDetail label={item.label} />
        </span>
      ))}
    </span>
  )
}

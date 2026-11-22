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
 * Display-only status icons for roster rows and gallery cards: bare icons side by side; hover
 * any one for its status.
 */
export function AthleteStatusIcons({ items, className = "" }: { items: AthleteStatusIcon[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}>
      {items.map((item) => (
        <span
          key={item.key}
          role="img"
          aria-label={item.label}
          className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"
        >
          <AppIcon name={item.icon} className={`h-4 w-4 overflow-visible ${TONE_CLASS[item.tone]}`} />
          <HoverDetail label={item.label} />
        </span>
      ))}
    </span>
  )
}

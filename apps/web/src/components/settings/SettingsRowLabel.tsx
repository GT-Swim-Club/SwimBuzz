import type { ReactNode } from "react"
import type { IconName } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"

/**
 * The left side of a settings row: an icon, the title, and an optional line under it. With a
 * description the icon grows to span both lines; a one-line row keeps it at text size.
 */
export default function SettingsRowLabel({
  icon,
  title,
  description,
  muted = false,
  children,
}: {
  icon: IconName
  title: ReactNode
  description?: ReactNode
  /** Secondary title color, for read-only info rows (Name, Email, …). */
  muted?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex w-5 shrink-0 justify-center text-foreground-tertiary">
        <AppIcon
          name={icon}
          className={description ? "h-5 w-5" : "h-4 w-4"}
          strokeWidth={description ? 1.75 : 2}
        />
      </span>
      <div className="min-w-0">
        <p className={`text-sm ${muted ? "text-foreground-secondary" : "text-foreground"}`}>{title}</p>
        {description ? <p className="text-xs text-foreground-secondary">{description}</p> : null}
        {children}
      </div>
    </div>
  )
}

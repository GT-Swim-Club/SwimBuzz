import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"

const ICON_BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center rounded-lg border bg-background transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background"

/** Square outlined icon button used in the athlete header and the History toolbar. */
export const ICON_BUTTON = `${ICON_BUTTON_BASE} border-border text-foreground hover:bg-fill`

export const ICON_BUTTON_DANGER = `${ICON_BUTTON_BASE} border-error-border text-error hover:bg-error-bg`

export function SwimCloudProfileLink({ swimCloudId }: { swimCloudId: number }) {
  return (
    <a
      href={`https://www.swimcloud.com/swimmer/${swimCloudId}/`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open SwimCloud profile (opens in a new tab)"
      className={`${ICON_BUTTON} h-9 w-9`}
    >
      <AppIcon name="externalLink" className="h-5 w-5" />
      <HoverDetail label="SwimCloud profile" />
    </a>
  )
}

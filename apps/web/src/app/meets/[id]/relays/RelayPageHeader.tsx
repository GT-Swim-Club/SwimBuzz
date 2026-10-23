import type { ReactNode } from "react"
import FitHeading from "@/components/ui/FitHeading"
import { MeetListThumb } from "../../MeetListMeta"

export const relayEyebrowClass =
  "text-sm font-semibold uppercase tracking-[0.16em] text-accent whitespace-nowrap"

/** Back link styling shared with the meet page header. */
export const relayBackLinkClass = "text-sm font-medium text-foreground-tertiary hover:text-foreground"

/**
 * Same layout and sizes as the meet page header: back link, meet icon + name, then a gold
 * eyebrow ("Relays" or the event picker) where the meet page shows its date and location.
 */
export default function RelayPageHeader({
  meetName,
  iconUrl,
  back,
  eyebrow,
  actions,
}: {
  meetName: string
  iconUrl: string | null
  back: ReactNode
  eyebrow: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="min-w-0">
      {/* Fragment keeps the server-passed element out of the children array; otherwise
          React warns about a missing key once the RSC lazy reference resolves. */}
      <>{back}</>
      <div className="mt-1 flex items-center gap-4 sm:gap-5">
        {iconUrl ? <MeetListThumb iconUrl={iconUrl} bannerUrl={null} size={80} label={`${meetName} icon`} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <FitHeading className="min-w-0 flex-1 text-4xl font-semibold text-foreground sm:text-5xl">
              {meetName}
            </FitHeading>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">{eyebrow}</div>
        </div>
      </div>
    </header>
  )
}

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
        {/* Phones: name, eyebrow, then the actions on a row of their own, so they never squeeze the
            name. Wider: the actions sit beside the name. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
          <FitHeading className="min-w-0 basis-full text-4xl font-semibold text-foreground sm:flex-1 sm:basis-0 sm:text-5xl">
            {meetName}
          </FitHeading>
          <div className="order-1 mt-1.5 flex min-w-0 basis-full flex-wrap items-center gap-x-2.5 gap-y-1 sm:order-2">
            {eyebrow}
          </div>
          {actions ? (
            <div className="order-2 mt-2.5 flex shrink-0 items-center gap-2 sm:order-1 sm:mt-0">{actions}</div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

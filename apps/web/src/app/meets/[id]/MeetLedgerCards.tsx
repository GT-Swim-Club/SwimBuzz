"use client"

import { useEffect, useState, type ReactNode } from "react"
import FilePreviewButton, { FilePreviewDialog } from "@/components/ui/FilePreview"
import {
  LedgerCard,
  LedgerIcon,
  LedgerIconButton,
  LedgerNote,
  LedgerRow,
  LedgerRowBody,
  ledgerRowClass,
  type LedgerIconName,
} from "@/components/meet/Ledger"
import type { EventOrder } from "@/lib/meet/meet-event-order"
import ImportMeetResourcesButton from "./ImportMeetResourcesButton"
import EventOrderButton from "./EventOrderButton"
import AddTravelInfoButton from "./AddTravelInfoButton"
import TravelInfoButtons, { type TravelInfoItem } from "./TravelInfoButtons"
import ManagePhotosButton from "./ManagePhotosButton"

export type CompetitionLink = {
  key: string
  label: string
  url: string
  icon: LedgerIconName
  /** Opens in a new tab instead of the in-app preview. */
  external?: boolean
  forcePdf?: boolean
  downloadName?: string
}

export function MeetCompetitionCard({
  isCoach,
  meetId,
  season,
  course,
  resourceInitial,
  linksBeforeOrder,
  linksAfterOrder,
  eventOrder,
  relaysHref,
}: {
  isCoach: boolean
  meetId: string
  season: string
  course: string
  resourceInitial: Parameters<typeof ImportMeetResourcesButton>[0]["initial"]
  /** Resource rows rendered before "Order of events" (the meet packet). */
  linksBeforeOrder: CompetitionLink[]
  linksAfterOrder: CompetitionLink[]
  eventOrder: EventOrder | null
  relaysHref?: string
}) {
  // Removed resources are hidden as soon as the dialog saves, not when the server round-trip
  // (DB write + storage delete) returns; restored if the save fails.
  const [hiddenUrls, setHiddenUrls] = useState<ReadonlySet<string>>(() => new Set())
  const serverUrls = [...linksBeforeOrder, ...linksAfterOrder].map((link) => link.url.trim())
  const serverUrlsKey = serverUrls.join("\n")
  const [seenServerUrlsKey, setSeenServerUrlsKey] = useState(serverUrlsKey)
  if (seenServerUrlsKey !== serverUrlsKey) {
    // Once the refreshed page no longer has a URL, the server has caught up — stop tracking it.
    setSeenServerUrlsKey(serverUrlsKey)
    const present = new Set(serverUrls)
    const stillHidden = [...hiddenUrls].filter((url) => present.has(url))
    if (stillHidden.length !== hiddenUrls.size) setHiddenUrls(new Set(stillHidden))
  }

  function hideUntilSaved(urls: string[], saved: Promise<unknown>) {
    setHiddenUrls((prev) => new Set([...prev, ...urls]))
    saved.catch(() =>
      setHiddenUrls((prev) => new Set([...prev].filter((url) => !urls.includes(url))))
    )
  }

  const isVisible = (link: CompetitionLink) => !hiddenUrls.has(link.url.trim())
  const visibleBeforeOrder = linksBeforeOrder.filter(isVisible)
  const visibleAfterOrder = linksAfterOrder.filter(isVisible)
  const packetUrl = resourceInitial.packetUrl.trim()
  const visibleEventOrder = packetUrl && hiddenUrls.has(packetUrl) ? null : eventOrder

  const hasResources =
    visibleBeforeOrder.length + visibleAfterOrder.length > 0 ||
    (visibleEventOrder?.sessions.length ?? 0) > 0
  const hasRows = hasResources || Boolean(relaysHref)

  const renderLink = (link: CompetitionLink) =>
    link.external ? (
      <LedgerRow key={link.key} icon={link.icon} label={link.label} href={link.url} external />
    ) : (
      <FilePreviewButton
        key={link.key}
        url={link.url}
        title={link.label}
        forcePdf={link.forcePdf}
        downloadName={link.downloadName}
        className={`${ledgerRowClass} cursor-pointer`}
      >
        <LedgerRowBody icon={link.icon} label={link.label} />
      </FilePreviewButton>
    )

  return (
    <LedgerCard
      title="Competition"
      aside={
        isCoach ? (
          <ImportMeetResourcesButton
            meetId={meetId}
            season={season}
            course={course}
            initial={resourceInitial}
            onRemove={hideUntilSaved}
            trigger={(open) => (
              <LedgerIconButton
                icon={hasResources ? "pencil" : "plus"}
                label={hasResources ? "Edit competition resources" : "Add competition resources"}
                onClick={open}
              />
            )}
          />
        ) : null
      }
    >
      {visibleBeforeOrder.map(renderLink)}
      {visibleEventOrder ? (
        <EventOrderButton
          order={visibleEventOrder}
          trigger={(open) => <LedgerRow icon="listOrdered" label="Order of events" onClick={open} />}
        />
      ) : null}
      {visibleAfterOrder.map(renderLink)}
      {relaysHref ? <LedgerRow icon="users" label="Relays" href={relaysHref} /> : null}
      {!hasRows ? <LedgerNote>No resources yet.</LedgerNote> : null}
    </LedgerCard>
  )
}

export function MeetTravelCard({
  isCoach,
  meetId,
  travelInitial,
  items,
  roomRows,
  hasRoomRows,
}: {
  isCoach: boolean
  meetId: string
  travelInitial: Parameters<typeof AddTravelInfoButton>[0]["initial"]
  items: TravelInfoItem[]
  /** Server-rendered roommate rows (MeetRoomSection ledger variant). */
  roomRows?: ReactNode
  hasRoomRows: boolean
}) {
  return (
    <LedgerCard
      title="Travel"
      aside={
        isCoach ? (
          <AddTravelInfoButton
            meetId={meetId}
            initial={travelInitial}
            trigger={(open) => (
              <LedgerIconButton icon="pencil" label="Edit travel info" onClick={open} />
            )}
          />
        ) : null
      }
    >
      <TravelInfoButtons items={items} variant="ledger" />
      {roomRows}
      {items.length === 0 && !hasRoomRows ? <LedgerNote>No travel info yet.</LedgerNote> : null}
    </LedgerCard>
  )
}

export function MeetPhotosCard({
  isCoach,
  meetId,
  photos,
  previews,
}: {
  isCoach: boolean
  meetId: string
  photos: { url: string; name: string }[]
  previews: string[]
}) {
  const [index, setIndex] = useState(0)
  const [viewing, setViewing] = useState<string | null>(null)
  const [reduced, setReduced] = useState(false)
  const count = previews.length
  const current = count > 0 ? ((index % count) + count) % count : 0

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    )
    return () => cancelAnimationFrame(frame)
  }, [])

  const hasAny = photos.length > 0 || count > 0

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background px-4 pb-4 pt-3">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">Photos</span>
        {isCoach ? (
          <ManagePhotosButton
            meetId={meetId}
            initial={{ photos, previews }}
            trigger={(open) => <LedgerIconButton icon="plus" label="Add photos" onClick={open} />}
          />
        ) : null}
      </div>

      {count > 0 ? (
        <>
          <div className="relative aspect-video w-full min-w-0 overflow-hidden rounded-lg">
            <div
              className="flex h-full w-full"
              style={{
                transform: `translateX(-${current * 100}%)`,
                transition: reduced ? "none" : "transform 300ms cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              {previews.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  aria-label={`Open meet photo ${i + 1}`}
                  aria-hidden={i !== current}
                  tabIndex={i === current ? 0 : -1}
                  onClick={() => setViewing(url)}
                  className="h-full w-full min-w-0 flex-[0_0_100%] cursor-zoom-in overflow-hidden rounded-lg bg-fill-secondary ring-1 ring-inset ring-black/5 dark:ring-white/5"
                >
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                </button>
              ))}
            </div>
            {count > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => setIndex(current - 1)}
                  className="absolute left-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/75"
                >
                  <LedgerIcon name="chevronLeft" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => setIndex(current + 1)}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/75"
                >
                  <LedgerIcon name="chevronRight" />
                </button>
              </>
            ) : null}
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-md">
              {current + 1} / {count}
            </span>
          </div>
          {count > 1 ? (
            <div className="flex items-center justify-center gap-[5px]">
              {previews.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  aria-label={`Show photo ${i + 1} of ${count}`}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === current ? "bg-accent" : "bg-fill dark:bg-foreground-quaternary"
                  }`}
                />
              ))}
            </div>
          ) : null}
          <FilePreviewDialog
            open={viewing !== null}
            onClose={() => setViewing(null)}
            title={`Meet photo ${current + 1}`}
            url={viewing ?? ""}
          />
        </>
      ) : hasAny ? null : (
        <p className="text-sm text-foreground-secondary">No photos yet.</p>
      )}

      {photos.length > 0 ? (
        <div className="-mx-4 -mb-4">
          {photos.map((photo, i) => (
            <LedgerRow
              key={`${photo.url}-${i}`}
              icon="image"
              label={photo.name || `Photo Link ${i + 1}`}
              href={photo.url}
              external
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

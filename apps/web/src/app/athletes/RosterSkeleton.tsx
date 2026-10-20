import { Skeleton } from "@/components/ui/Skeleton"
import type { ListLayout } from "@/lib/list-layout"
import { GALLERY_CARD_AVATAR, GALLERY_CARD_BODY } from "./AthleteGalleryCard"

/** Name bar widths, varied per row so the list doesn't look stamped. */
const NAME_WIDTHS = ["w-40", "w-32", "w-44", "w-28", "w-36", "w-48", "w-32", "w-40", "w-36", "w-28", "w-44", "w-32"]

/**
 * Mirrors the roster toolbar (search box, Gender and Season selects, the
 * List/Gallery toggle) and RosterView's results in the saved layout, with the
 * A–Z rail beside them. Phones get FluidToolbar's collapsed search button.
 */
export default function RosterSkeleton({ layout }: { layout: ListLayout }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-[42px] min-w-[200px] flex-1 items-center rounded-lg border border-border-secondary bg-background px-3 max-sm:hidden">
          <Skeleton className="h-3.5 w-32 max-w-full" />
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-3 max-sm:flex-1">
          <div className="mr-auto flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-border-secondary bg-background sm:hidden">
            <Skeleton className="h-4 w-4" />
          </div>
          {["w-8", "w-20"].map((w) => (
            <div
              key={w}
              className="flex h-[42px] items-center gap-3 rounded-lg border border-border-secondary bg-background px-3"
            >
              <Skeleton className={`h-3.5 ${w}`} />
              <Skeleton className="h-3 w-3" />
            </div>
          ))}
          <div className="flex h-[42px] items-center gap-1 rounded-lg border border-border-secondary bg-background p-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex h-8 w-8 items-center justify-center">
              <Skeleton className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {layout === "list" ? (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 py-3.5 sm:px-6 md:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)]">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="hidden h-2.5 w-14 md:block" />
                <Skeleton className="hidden h-2.5 w-10 md:block" />
                <Skeleton className="hidden h-2.5 w-8 md:block" />
              </div>
              {NAME_WIDTHS.map((w, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)] items-center gap-4 border-t border-border px-4 py-2.5 sm:px-6 md:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Skeleton className={`h-4 max-w-full ${w}`} />
                      <Skeleton className="h-3 w-28 md:hidden" />
                    </div>
                  </div>
                  <Skeleton className="hidden h-3.5 w-12 md:block" />
                  <Skeleton className="hidden h-3.5 w-16 md:block" />
                  <Skeleton className="hidden h-3.5 w-6 md:block" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(max(240px,calc((100%_-_2.25rem)/4)),1fr))] gap-3">
              {NAME_WIDTHS.map((w, i) => (
                <div key={i} className="@container rounded-xl border border-border bg-background shadow-sm">
                  <div className={GALLERY_CARD_BODY}>
                    <Skeleton className={`shrink-0 rounded-full ${GALLERY_CARD_AVATAR}`} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 xl:@[290px]:gap-2">
                      <Skeleton className={`h-4 max-w-full xl:@[290px]:h-5 ${w}`} />
                      <Skeleton className="h-3 w-28 max-w-full xl:@[290px]:h-3.5 xl:@[290px]:w-32" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-[7px] py-[5px]">
          {Array.from({ length: 26 }, (_, i) => (
            <Skeleton key={i} className="h-2.5 w-2.5 rounded-sm" />
          ))}
        </div>
      </div>
    </>
  )
}

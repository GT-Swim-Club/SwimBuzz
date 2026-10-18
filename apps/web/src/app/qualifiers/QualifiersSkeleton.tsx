import { Skeleton } from "@/components/ui/Skeleton"
import type { ListLayout } from "@/lib/list-layout"
import { EVENT_LIST_COLS, QUALIFIER_LIST_COLS } from "./QualifiersList"

const boxClass = "flex h-[42px] items-center rounded-lg border border-border-secondary bg-background"
const galleryGridClass = "grid grid-cols-[repeat(auto-fill,minmax(max(220px,calc((100%-36px)/4)),1fr))] gap-3"
/** Per-row widths, varied so the rows don't look stamped. */
const NAME_WIDTHS = ["w-28", "w-36", "w-24", "w-32", "w-28", "w-20", "w-36", "w-24"]
const LINE_COUNTS = [2, 4, 1, 3, 1, 2, 3, 1]

/**
 * Mirrors the Nationals toolbar: search box, View standards, the Gender,
 * Season and Group by selects, then the List/Gallery toggle. Phones get
 * FluidToolbar's collapsed search button instead of the box (the real switch
 * is measured; sm approximates it).
 */
function ToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className={`${boxClass} min-w-[200px] flex-1 px-3 max-sm:hidden`}>
        <Skeleton className="h-3.5 w-36 max-w-full" />
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-3 max-sm:flex-1">
        <div className={`${boxClass} mr-auto w-[42px] justify-center sm:hidden`}>
          <Skeleton className="h-4 w-4" />
        </div>
        <Skeleton className="mx-1 h-3.5 w-24 max-sm:hidden" />
        {["w-8", "w-20", "w-20"].map((w, i) => (
          <div key={i} className={`${boxClass} gap-3 px-3`}>
            <Skeleton className={`h-3.5 ${w}`} />
            <Skeleton className="h-3 w-3" />
          </div>
        ))}
        <div className={`${boxClass} gap-1 p-1`}>
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex h-8 w-8 items-center justify-center">
            <Skeleton className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** A swim line: lead cell, meet, date, then time and standard. */
function SwimLineSkeleton({ lead }: { lead: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-2.5 py-1.5 md:col-span-full md:grid-cols-subgrid md:gap-x-2 md:px-0">
      <Skeleton className={`h-4 max-w-full md:ml-2.5 ${lead}`} />
      <Skeleton className="h-4 w-40 max-w-full max-md:row-start-2 md:ml-2.5" />
      <Skeleton className="h-4 w-20 max-md:row-start-2 max-md:justify-self-end md:ml-2.5" />
      <Skeleton className="h-4 w-14 justify-self-end max-md:col-start-2 max-md:row-start-1" />
      <Skeleton className="mr-2.5 h-4 w-14 justify-self-end max-md:hidden" />
    </div>
  )
}

function ListSkeleton({ byEvent }: { byEvent: boolean }) {
  const cols = byEvent ? EVENT_LIST_COLS : QUALIFIER_LIST_COLS
  return (
    <div className="overflow-hidden rounded-xl border border-border-secondary bg-background">
      <div className={`hidden gap-2 border-b border-border-secondary px-5 py-2.5 md:grid ${cols}`}>
        {["w-14", "w-12", "w-10", "w-10", "w-10", "w-16"].map((w, i) => (
          <Skeleton key={i} className={`h-2.5 ${w} ${i === 0 ? "" : i >= 4 ? "justify-self-end" : "ml-2.5"} ${i === 5 ? "mr-2.5" : ""}`} />
        ))}
      </div>
      <div className="divide-y divide-border-secondary">
        {NAME_WIDTHS.map((name, i) => (
          <div key={i} className={`grid gap-2 px-3 py-2 sm:px-5 ${cols}`}>
            {byEvent ? (
              <div className="flex flex-col gap-1.5 pt-1 max-md:px-2.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              <div className="flex items-center gap-2.5 self-start max-md:px-2.5">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className={`h-4 ${name}`} />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            )}
            <div className="grid min-w-0 content-start md:col-span-5 md:grid-cols-subgrid">
              {Array.from({ length: LINE_COUNTS[i] }, (_, j) => (
                <SwimLineSkeleton key={j} lead={byEvent ? NAME_WIDTHS[(i + j + 3) % NAME_WIDTHS.length] : "w-16"} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GallerySkeleton({ byEvent }: { byEvent: boolean }) {
  return (
    <div className={galleryGridClass}>
      {NAME_WIDTHS.map((name, i) => (
        <div key={i} className="flex flex-col rounded-xl border border-border-secondary bg-background p-4">
          {byEvent ? (
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className={`h-4 ${name}`} />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-col gap-1">
            {Array.from({ length: Math.min(LINE_COUNTS[i], byEvent ? 4 : 3) }, (_, j) => (
              <div key={j} className="flex items-center justify-between gap-3 py-1">
                <Skeleton className={`h-3.5 ${byEvent ? NAME_WIDTHS[(i + j + 3) % NAME_WIDTHS.length] : "w-16"}`} />
                <Skeleton className="h-3.5 w-14" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The Nationals page while loading, in the layout (and grouping, when known) it will open in. */
export default function QualifiersSkeleton({ layout, byEvent = false }: { layout: ListLayout; byEvent?: boolean }) {
  return (
    <>
      <ToolbarSkeleton />
      {layout === "list" ? <ListSkeleton byEvent={byEvent} /> : <GallerySkeleton byEvent={byEvent} />}
    </>
  )
}

import { Skeleton } from "@/components/ui/Skeleton"
import type { ListLayout } from "@/lib/list-layout"
import { qualifierHeaderBgClass } from "./qualifier-styles"

const boxClass = "flex h-[42px] items-center rounded-lg border border-border-secondary bg-background"
const galleryGridClass = "grid grid-cols-[repeat(auto-fill,minmax(max(min(300px,100%),calc((100%-36px)/4)),1fr))] gap-3"
/** Per-row widths, varied so the rows don't look stamped. */
const NAME_WIDTHS = ["w-28", "w-36", "w-24", "w-32", "w-28", "w-20", "w-36", "w-24"]
const LINE_COUNTS = [2, 4, 1, 3, 1, 2, 3, 1]

/**
 * Mirrors the Nationals toolbar: search box, View standards, the Gender,
 * Season and Group by selects, the List/Gallery toggle, then Download PDF. Phones get
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
        <div className={`${boxClass} w-[42px] justify-center`}>
          <Skeleton className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

const LIST_COLS = {
  athlete: "md:grid-cols-[minmax(7rem,10rem)_6.5rem_6.5rem_7rem_minmax(0,1fr)_7.5rem]",
  event: "md:grid-cols-[minmax(10rem,15rem)_6.5rem_6.5rem_7rem_minmax(0,1fr)_7.5rem]",
}
const rowGridClass = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 max-sm:px-3 md:gap-x-2"

/**
 * A swim line: lead, time, margin, standard, meet and date (QualifiersList's columns). Phones: lead
 * and time (with margin), then meet · date and the cut.
 */
function SwimLineSkeleton({ lead, cols }: { lead: string; cols: string }) {
  return (
    <div className={`${rowGridClass} ${cols} gap-y-1.5 border-t border-border-subtle py-2.5 first:border-t-0`}>
      <Skeleton className={`h-4 max-w-full ${lead}`} />
      <Skeleton className="h-4 w-14 justify-self-end max-md:col-start-2 max-md:row-start-1 max-md:w-24" />
      <Skeleton className="h-4 w-12 justify-self-end max-md:hidden" />
      <Skeleton className="h-4 w-14 justify-self-end max-md:col-start-2 max-md:row-start-2" />
      <Skeleton className="h-4 w-40 max-w-full max-md:col-start-1 max-md:row-start-2 md:ml-12" />
      <Skeleton className="h-4 w-24 max-md:hidden" />
    </div>
  )
}

function ListSkeleton({ byEvent }: { byEvent: boolean }) {
  const cols = byEvent ? LIST_COLS.event : LIST_COLS.athlete
  return (
    <div className="overflow-hidden rounded-xl border border-border-secondary bg-background">
      {NAME_WIDTHS.map((name, i) => (
        <div key={i} className="border-t border-border-secondary first:border-t-0">
          <div className={`flex min-h-12 items-center gap-2.5 px-4 py-2 max-sm:px-3 ${qualifierHeaderBgClass}`}>
            {byEvent ? null : <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
            <Skeleton className={`h-4 ${byEvent ? "w-28" : name}`} />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
          <div>
            {Array.from({ length: LINE_COUNTS[i] }, (_, j) => (
              <SwimLineSkeleton
                key={j}
                cols={cols}
                lead={byEvent ? NAME_WIDTHS[(i + j + 3) % NAME_WIDTHS.length] : "w-16"}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Same slot as QualifiersView's JumpRail: beside the list, just outside it in the right margin when wide. */
function RailSkeleton() {
  return (
    <div className="shrink-0 self-stretch min-[1040px]:absolute min-[1040px]:inset-y-0 min-[1040px]:left-full min-[1040px]:ml-3">
      <div className="flex flex-col items-center gap-[7px] py-[5px]">
        {Array.from({ length: 26 }, (_, i) => (
          <Skeleton key={i} className="h-2.5 w-2.5 rounded-sm" />
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
                <Skeleton className="h-3.5 w-20" />
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
      {byEvent ? (
        layout === "list" ? (
          <ListSkeleton byEvent />
        ) : (
          <GallerySkeleton byEvent />
        )
      ) : (
        // JumpRail's JUMP_RAIL_LAYOUT_CLASS, inlined (a client module's exports aren't values here).
        <div className="relative flex items-start gap-1 min-[1040px]:block">
          <div className="min-w-0 flex-1">
            {layout === "list" ? <ListSkeleton byEvent={false} /> : <GallerySkeleton byEvent={false} />}
          </div>
          <RailSkeleton />
        </div>
      )}
    </>
  )
}

import { Skeleton } from "@/components/ui/Skeleton"
import type { ListLayout } from "@/lib/list-layout"
import { MEET_LIST_COLS } from "./MeetListTable"

/**
 * Mirrors the meets toolbar: search box, the Season and All/My meets selects,
 * then the Gallery/List toggle. Phones get FluidToolbar's collapsed search
 * button instead of the box (the real switch is measured; sm approximates it).
 */
export function MeetsToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-[42px] min-w-[200px] flex-1 items-center rounded-lg border border-border-secondary bg-background px-3 max-sm:hidden">
        <Skeleton className="h-3.5 w-24 max-w-full" />
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-3 max-sm:flex-1">
        <div className="mr-auto flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-border-secondary bg-background sm:hidden">
          <Skeleton className="h-4 w-4" />
        </div>
        {["w-24", "w-20"].map((w) => (
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
  )
}

/**
 * Mirrors MeetGalleryCard: a banner frame with the details block along the
 * bottom — icon, optional eyebrow, title, then date and location (stacked on
 * narrow cards, like `stackMeta`).
 */
function MeetCardSkeleton({
  eyebrow = false,
  stacked = false,
  title,
  className = "",
}: {
  eyebrow?: boolean
  stacked?: boolean
  /** Title bar width, varied per card so the row doesn't look stamped. */
  title: string
  className?: string
}) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col justify-end overflow-hidden rounded-2xl border border-border-secondary bg-background max-sm:aspect-video ${className}`}
    >
      <div className="flex items-center gap-3 px-5 pb-5">
        <Skeleton className={`shrink-0 rounded-lg ${eyebrow ? "h-[68px] w-[68px]" : "h-14 w-14"}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {eyebrow && <Skeleton className="h-2.5 w-28" />}
          <Skeleton className={`h-5 max-w-full ${title}`} />
          {stacked ? (
            <>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </>
          ) : (
            <div className="flex items-center gap-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Past-meet cards per row at each breakpoint, matching useMaxPerRow in
// MeetGalleryCard (2, then 3 at md, 4 at lg, 5 at 2xl; phones stack the first two).
const pastCards = [
  { title: "w-3/4", className: "" },
  { title: "w-2/3", className: "" },
  { title: "w-4/5", className: "hidden md:flex" },
  { title: "w-3/5", className: "hidden lg:flex" },
  { title: "w-2/3", className: "hidden 2xl:flex" },
]

// Name and location bar widths per row, varied so rows don't look stamped.
const listRows = [
  ["w-3/5", "w-3/4"],
  ["w-1/2", "w-2/3"],
  ["w-2/3", "w-1/2"],
  ["w-2/5", "w-3/5"],
  ["w-1/2", "w-4/5"],
]


/** Mirrors one MeetListTable section: heading, column header, then rows of icon, name, location and date. */
export function MeetListSkeleton({
  heading,
  rows,
  actions = "none",
}: {
  heading: string
  rows: number
  actions?: keyof typeof MEET_LIST_COLS
}) {
  const cols = MEET_LIST_COLS[actions]
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className={`h-4 ${heading}`} />
      <div className="overflow-hidden rounded-xl border border-border-secondary bg-background">
        <div className={`grid items-center gap-6 border-b border-border-secondary px-5 pb-3 pt-3.5 ${cols}`}>
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="hidden h-2.5 w-16 lg:block" />
          <Skeleton className="hidden h-2.5 w-10 md:block" />
        </div>
        {listRows.slice(0, rows).map(([name, location], i) => (
          <div
            key={i}
            className={`grid items-center gap-6 border-t border-border-secondary px-5 py-[18px] first:border-t-0 ${cols}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
                <Skeleton className={`h-4 max-w-full ${name}`} />
                <Skeleton className="h-2.5 w-24 lg:hidden" />
                <Skeleton className="h-2.5 w-32 max-w-full sm:hidden" />
              </div>
            </div>
            <Skeleton className={`hidden h-3.5 lg:block ${location}`} />
            <Skeleton className="hidden h-3.5 w-28 md:block" />
            {actions === "edit" && <Skeleton className="h-4 w-4" />}
            {actions === "trash" && (
              <div className="flex justify-end gap-2">
                <Skeleton className="h-8 w-8 rounded-lg sm:w-[74px]" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * Mirrors MeetsClientWrapper in the viewer's last-used layout. Gallery: an
 * "Upcoming meets" row of two, then a full "Past meets" row. List: the same
 * two sections as tables.
 */
export default function MeetsListSkeleton({ layout = "gallery" }: { layout?: ListLayout }) {
  if (layout === "list") {
    return (
      <div className="flex flex-col gap-8">
        <MeetListSkeleton heading="w-36" rows={2} />
        <MeetListSkeleton heading="w-28" rows={5} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-36" />
        <div className="grid aspect-[32/9] grid-cols-2 gap-4 max-sm:aspect-auto max-sm:grid-cols-1">
          <MeetCardSkeleton eyebrow title="w-1/2" />
          <MeetCardSkeleton eyebrow title="w-2/5" />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="grid aspect-[32/9] grid-cols-2 gap-4 max-sm:aspect-auto max-sm:grid-cols-1 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {pastCards.map((c, i) => (
            <MeetCardSkeleton key={i} stacked title={c.title} className={c.className} />
          ))}
        </div>
      </section>
    </div>
  )
}

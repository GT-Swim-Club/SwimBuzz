import { Skeleton } from "@/components/ui/Skeleton"

/** Mirrors the meets toolbar: search box, then the Season and All/My meets selects. */
export function MeetsToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-[42px] min-w-[200px] flex-1 items-center rounded-lg border border-border-secondary bg-background px-3">
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {["w-24", "w-20"].map((w) => (
          <div
            key={w}
            className="flex h-[42px] items-center gap-3 rounded-lg border border-border-secondary bg-background px-3"
          >
            <Skeleton className={`h-3.5 ${w}`} />
            <Skeleton className="h-3 w-3" />
          </div>
        ))}
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

/** Mirrors MeetsClientWrapper: an "Upcoming meets" row of two, then a full "Past meets" row. */
export default function MeetsListSkeleton() {
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

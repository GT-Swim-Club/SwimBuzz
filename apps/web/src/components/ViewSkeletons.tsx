import { Skeleton } from "@/components/Skeleton"

export type ViewSkeletonVariant = "gallery" | "list" | "week" | "month"

export function GalleryViewSkeleton() {
  return (
    <div className="space-y-8">
      {[...Array(2)].map((_, i) => (
        <section key={i} className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {[...Array(4)].map((_, j) => (
              <Skeleton key={j} className="h-48 w-full" />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function ListViewSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {[...Array(rows)].map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  )
}

export function WeekViewSkeleton() {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-24" />
        <div className="space-y-1 text-center">
          <Skeleton className="mx-auto h-6 w-40" />
          <Skeleton className="mx-auto h-4 w-20" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="space-y-2 md:hidden">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border border-border-secondary md:block">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="grid grid-cols-7">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-none" />
          ))}
        </div>
      </div>
    </section>
  )
}

export function MonthViewSkeleton() {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-24" />
        <div className="space-y-1 text-center">
          <Skeleton className="mx-auto h-6 w-32" />
          <Skeleton className="mx-auto h-4 w-20" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border-secondary">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="grid grid-cols-7">
          {[...Array(35)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-none sm:h-28 md:h-36" />
          ))}
        </div>
      </div>
    </section>
  )
}

export function ViewSkeleton({ variant }: { variant: ViewSkeletonVariant }) {
  switch (variant) {
    case "gallery":
      return <GalleryViewSkeleton />
    case "list":
      return <ListViewSkeleton />
    case "week":
      return <WeekViewSkeleton />
    case "month":
      return <MonthViewSkeleton />
  }
}

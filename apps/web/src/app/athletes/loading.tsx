import { Skeleton } from "@/components/Skeleton"

function AthleteCardSkeleton() {
  return (
    <div className="flex h-full flex-col items-center gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
      <Skeleton className="h-20 w-20 rounded-full" />
      <div className="w-full space-y-1.5">
        <Skeleton className="mx-auto h-4 w-4/5" />
        <Skeleton className="mx-auto h-3 w-1/2" />
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <main className="space-y-6" aria-busy="true" aria-label="Loading roster">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
        {[...Array(12)].map((_, i) => (
          <AthleteCardSkeleton key={i} />
        ))}
      </div>
    </main>
  )
}

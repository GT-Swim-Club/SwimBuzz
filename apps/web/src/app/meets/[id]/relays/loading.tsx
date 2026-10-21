import { Skeleton } from "@/components/ui/Skeleton"
import { RelaySummaryCardSkeleton } from "./RelaySummary"

export default function Loading() {
  return (
    <main
      className="w-full flex flex-col gap-6 py-2 sm:py-4"
      aria-busy="true"
      aria-label="Loading relays"
    >
      <header>
        <Skeleton className="h-4 w-16" />
        <div className="mt-1 flex items-center gap-4 sm:gap-5">
          <Skeleton className="h-20 w-20 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-10 w-2/3 max-w-lg sm:h-12" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
      </header>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] items-start gap-x-4 gap-y-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex min-h-8 items-center gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <RelaySummaryCardSkeleton />
            <RelaySummaryCardSkeleton />
          </div>
        ))}
      </div>
    </main>
  )
}

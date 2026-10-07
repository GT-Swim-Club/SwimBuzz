import { Skeleton } from "@/components/ui/Skeleton"
import MeetsListSkeleton from "./MeetsListSkeleton"

export default function Loading() {
  return (
    <main className="flex flex-col gap-6" aria-busy="true" aria-label="Loading meets">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-[42px] min-w-[200px] flex-1 rounded-lg" />
        <Skeleton className="h-[42px] w-64 rounded-lg" />
      </div>
      <MeetsListSkeleton />
    </main>
  )
}

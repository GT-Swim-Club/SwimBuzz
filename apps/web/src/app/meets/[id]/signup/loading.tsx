import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl flex flex-col gap-6 py-2 sm:py-4"
      aria-busy="true"
      aria-label="Loading meet sign-up"
    >
      <Skeleton className="h-4 w-20" />
      <header className="space-y-2">
        <Skeleton className="h-9 w-2/3 max-w-md sm:h-10" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-1 h-4 w-56" />
      </header>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <div className="flex flex-wrap gap-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <div className="flex flex-wrap gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-lg" />
            ))}
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </main>
  )
}

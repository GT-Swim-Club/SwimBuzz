import { Skeleton } from "@/components/ui/Skeleton"

export default function Loading() {
  return (
    <main
      className="mx-auto max-w-3xl flex flex-col gap-6 py-2 sm:py-4"
      aria-busy="true"
      aria-label="Loading roommate preferences"
    >
      <Skeleton className="h-4 w-20" />
      <header className="space-y-2">
        <Skeleton className="h-9 w-2/3 max-w-md sm:h-10" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-4 w-48" />
      </header>
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </main>
  )
}

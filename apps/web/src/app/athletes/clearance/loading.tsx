import { Skeleton } from "@/components/ui/Skeleton"

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5" aria-busy="true" aria-label="Loading clearance">
      <Skeleton className="h-4 w-20" />
      <header className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>
      <div className="flex items-center gap-3">
        <Skeleton className="h-[42px] min-w-0 flex-1 rounded-lg" />
        <Skeleton className="h-[42px] w-40 rounded-lg" />
        <Skeleton className="h-[42px] w-32 rounded-lg" />
        <Skeleton className="h-[42px] w-24 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="hidden gap-3 border-b border-border px-4 py-3 md:flex">
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="divide-y divide-border-secondary">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_auto]"
            >
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28 md:hidden" />
              </div>
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

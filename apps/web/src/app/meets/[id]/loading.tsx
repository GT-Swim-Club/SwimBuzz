import { Skeleton } from "@/components/ui/Skeleton"

const resourceChips = ["w-28", "w-24", "w-32", "w-24", "w-28"]

export default function Loading() {
  return (
    <main className="relative mx-auto max-w-4xl" aria-busy="true" aria-label="Loading meet">
      <div className="relative z-10 space-y-8">
        <div className="space-y-4">
          <div className="min-w-0">
            <Skeleton className="h-4 w-16" />
            <div className="mt-1 flex items-center gap-4 sm:gap-5">
              <Skeleton className="h-20 w-20 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-9 w-3/5 max-w-sm sm:h-10" />
                  <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                </div>
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>
        </div>

        <section>
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="flex flex-wrap gap-2">
            {resourceChips.map((width, i) => (
              <Skeleton key={i} className={`h-8 ${width} rounded-lg`} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border px-4 py-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3.5 w-1/2" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

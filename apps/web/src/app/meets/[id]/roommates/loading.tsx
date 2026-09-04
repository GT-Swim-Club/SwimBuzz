import { Skeleton } from "@/components/ui/Skeleton"

export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl flex flex-col gap-6 py-2 sm:py-4"
      aria-busy="true"
      aria-label="Loading roommates"
    >
      <Skeleton className="h-4 w-20" />
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </header>
        <Skeleton className="h-14 w-full rounded-xl" />
        <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
          <Skeleton className="h-5 w-40" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-background p-4">
                <Skeleton className="h-4 w-2/3" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
          <Skeleton className="h-5 w-32" />
          <div className="mt-5 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border px-4 py-3">
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

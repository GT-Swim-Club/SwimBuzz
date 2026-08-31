import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-5" aria-busy="true" aria-label="Loading attendance">
      <Skeleton className="h-4 w-20" />
      <header className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </header>
      <section className="rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        <div className="mx-auto max-w-xs space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="mx-auto h-10 w-32 rounded-lg" />
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="mt-4 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border-secondary px-3 py-2.5">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

import { Skeleton } from "@/components/Skeleton"

const setSkeletons = ["w-full", "w-full", "w-11/12"]

export default function PracticeEditSkeleton() {
  return (
    <main className="mx-auto max-w-4xl space-y-5 pb-6" aria-busy="true" aria-label="Loading practice editor">
      <header className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-3/5 max-w-xl rounded-lg" />
        <div className="mt-2 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 flex-1 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-full rounded-lg sm:w-1/2" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </header>

      <section className="rounded-2xl border-l-[3px] border-l-primary bg-background px-4 py-3 sm:px-5 sm:py-4">
        <Skeleton className="mb-2 h-3 w-24" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </section>

      <section className="space-y-5 rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        {setSkeletons.map((width, index) => (
          <div
            key={index}
            className="space-y-3 border-b border-border pb-5 last:border-b-0 last:pb-0"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            </div>
            <Skeleton className={`h-16 ${width} rounded-lg`} />
          </div>
        ))}
        <Skeleton className="h-10 w-full rounded-lg" />
      </section>

      <div className="mx-auto w-full rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-lg sm:px-5">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 flex-1 rounded-lg" />
        </div>
      </div>
    </main>
  )
}

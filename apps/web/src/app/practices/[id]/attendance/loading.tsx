import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-5">
      <Skeleton className="h-5 w-32" />
      <div>
        <Skeleton className="h-9 w-64 sm:h-10" />
        <Skeleton className="mt-2 h-4 w-24" />
        <Skeleton className="mt-3 h-4 w-72" />
      </div>
      <div className="rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-9 w-full rounded-lg" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  )
}

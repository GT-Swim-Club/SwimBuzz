import { Skeleton } from "@/components/ui/Skeleton"

export default function Loading() {
  return (
    <main className="space-y-4" aria-busy="true" aria-label="Loading qualifiers">
      <section className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </section>
    </main>
  )
}

import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-56" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <div className="flex flex-wrap gap-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-28" />
          ))}
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
    </main>
  )
}

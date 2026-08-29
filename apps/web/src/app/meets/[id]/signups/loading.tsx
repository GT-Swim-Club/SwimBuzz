import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-56" />
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </main>
  )
}

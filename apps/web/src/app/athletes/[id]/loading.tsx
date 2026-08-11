import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
      <section className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full" />
      </section>
      <section className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-64 w-full" />
      </section>
    </main>
  )
}

import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
      <section className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </section>
      <section className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-32 w-full" />
      </section>
      <section className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-96 w-full" />
      </section>
    </main>
  )
}

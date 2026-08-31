import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <div
      className="relative -mx-4 -my-8 flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-12"
      aria-busy="true"
      aria-label="Loading sign in"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border-secondary bg-background/90 p-8 shadow-xl">
        <div className="flex items-center justify-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-24" />
        </div>

        <div className="mt-5 flex flex-col items-center gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-60" />
        </div>

        <div className="mt-6 space-y-3">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}

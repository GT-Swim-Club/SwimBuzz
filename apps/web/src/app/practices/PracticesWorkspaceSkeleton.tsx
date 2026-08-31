import type { ReactNode } from "react"
import { Skeleton } from "@/components/Skeleton"

export default function PracticesWorkspaceSkeleton({ detail }: { detail?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-4 md:grid md:grid-cols-[360px_6px_minmax(0,1fr)] md:items-stretch md:gap-8">
      <div className="hidden flex-col gap-3 md:flex">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="ml-auto h-10 w-10 rounded-lg" />
        </div>
        <div className="flex-1 space-y-1.5 rounded-xl border border-border-secondary p-2">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div aria-hidden className="hidden md:block" />
      <div className="space-y-5">
        {detail ?? (
          <>
            <div className="space-y-3">
              <Skeleton className="h-10 w-3/5 max-w-xl" />
              <Skeleton className="h-5 w-52" />
            </div>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </>
        )}
      </div>
    </div>
  )
}

import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/Skeleton"
import PracticeViewSkeleton from "./[id]/PracticeViewSkeleton"

// Title widths per weekday row; null = an empty day ("No practice posted").
const dayRows = ["w-20", null, "w-24", null, "w-16", null, null]

/** Mirrors PracticesSidebar's week view: toolbar, week header, and day rows. */
function SidebarSkeleton() {
  return (
    <div className="hidden min-h-0 flex-col gap-3 md:flex md:h-[calc(100dvh-var(--workspace-offset,9rem))]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2 pl-0.5">
          <Skeleton className="h-6 w-36" />
          <div className="flex shrink-0 items-center gap-1.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-[60px] rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-border-secondary bg-background p-2">
          {dayRows.map((title, i) => (
            <div
              key={i}
              className="flex flex-1 items-center gap-3 rounded-lg border border-border-secondary px-3 py-3"
            >
              <div className="flex w-10 shrink-0 flex-col items-center gap-1.5">
                <Skeleton className="h-2.5 w-7" />
                <Skeleton className="h-4 w-5" />
              </div>
              {title ? (
                <>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className={`h-4 ${title}`} />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-3 w-14 shrink-0" />
                </>
              ) : (
                <Skeleton className="h-4 w-32 opacity-50" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PracticesWorkspaceSkeleton({ detail }: { detail?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-4 md:grid md:grid-cols-[324px_6px_minmax(0,1fr)] md:items-start md:gap-5">
      <SidebarSkeleton />
      <div aria-hidden className="hidden self-stretch md:flex md:justify-center">
        <span className="w-px bg-border-secondary" />
      </div>
      <div className="space-y-5">
        {detail ?? <PracticeViewSkeleton />}
      </div>
    </div>
  )
}

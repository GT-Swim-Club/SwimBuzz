import { Skeleton } from "@/components/ui/Skeleton"

const sections = [
  { title: "w-20", rows: 4, description: false },
  { title: "w-28", rows: 4, description: true },
  { title: "w-28", rows: 1, description: false },
]

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8" aria-busy="true" aria-label="Loading settings">
      <div>
        <Skeleton className="h-9 w-36 sm:h-10" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      {sections.map((section, i) => (
        <section key={i}>
          <div className="mb-1.5 flex min-h-[34px] flex-col justify-center gap-1">
            <Skeleton className={`h-4 ${section.title}`} />
            {section.description && <Skeleton className="h-3 w-48" />}
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border-secondary bg-background shadow-xs">
            {[...Array(section.rows)].map((_, j) => (
              <div key={j} className="flex items-center justify-between gap-4 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

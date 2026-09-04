import { Skeleton } from "@/components/ui/Skeleton"

const sections = [
  { title: "w-20", rows: 3 },
  { title: "w-16", rows: 2 },
  { title: "w-28", rows: 1 },
  { title: "w-24", rows: 1 },
]

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-8 w-24" />
      <Skeleton className="mt-1 h-4 w-64" />

      <div className="mt-8 space-y-6">
        {sections.map((section, i) => (
          <section key={i} className="rounded-xl border border-border-secondary">
            <div className="border-b border-border-secondary px-4 py-3">
              <Skeleton className={`h-4 ${section.title}`} />
            </div>
            <div className="divide-y divide-border">
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
    </div>
  )
}

import Link from "next/link"
import type { QualifierAthlete } from "@/lib/nationals-qualifiers"
import QualifierGalleryCard from "./QualifierGalleryCard"

export default function QualifiersList({
  qualifiers,
  emptyMessage,
  view = "list",
}: {
  qualifiers: QualifierAthlete[]
  emptyMessage: string
  view?: "list" | "gallery"
}) {
  if (qualifiers.length === 0) {
    return (
      <p className="text-sm text-foreground-secondary px-4 py-8 text-center border border-border-secondary rounded-xl bg-background">
        {emptyMessage}
      </p>
    )
  }

  if (view === "gallery") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {qualifiers.map((athlete) => (
          <QualifierGalleryCard key={athlete.athleteId} athlete={athlete} />
        ))}
      </div>
    )
  }

  return (
    <div className="divide-y border border-border-secondary rounded-xl overflow-hidden bg-background">
      {qualifiers.map((athlete) => (
        <div key={athlete.athleteId} className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary-bg flex items-center justify-center text-sm font-medium text-primary shrink-0">
              {athlete.firstName[0]}
              {athlete.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <Link
                href={`/athletes/${athlete.athleteId}`}
                className="font-medium text-sm text-foreground hover:text-primary"
              >
                {athlete.lastName}, {athlete.firstName}
              </Link>
              <p className="text-[11px] uppercase tracking-wide text-foreground-tertiary">
                {athlete.gender === "F" ? "Women" : "Men"} · {athlete.events.length} event
                {athlete.events.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 pl-12">
            {athlete.events.map((ev) => (
              <li
                key={`${athlete.athleteId}-${ev.event}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {ev.event}
                  </span>
                  <span className="text-foreground-secondary">
                    {" "}
                    · {ev.meetName}
                    {ev.meetId ? (
                      <>
                        {" "}
                        (
                        <Link
                          href={`/meets/${ev.meetId}`}
                          className="hover:text-primary"
                        >
                          {ev.date}
                        </Link>
                        )
                      </>
                    ) : (
                      <> ({ev.date})</>
                    )}
                  </span>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <span className="font-medium text-success">
                    {ev.time}
                  </span>
                  <span className="text-xs text-foreground-tertiary">
                    {" "}
                    / {ev.cut}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

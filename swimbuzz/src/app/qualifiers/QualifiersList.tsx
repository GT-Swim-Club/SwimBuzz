import Link from "next/link"
import type { QualifierAthlete } from "@/lib/nationals-qualifiers"
import QualifierGalleryCard from "./QualifierGalleryCard"
import { athletePath, meetSwimPath } from "@/lib/slug"

export default function QualifiersList({
  qualifiers,
  currentUserAthleteId,
  emptyMessage,
  view = "list",
}: {
  qualifiers: QualifierAthlete[]
  currentUserAthleteId?: string | null
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
          <QualifierGalleryCard key={athlete.athleteId} athlete={athlete} currentUserAthleteId={currentUserAthleteId} />
        ))}
      </div>
    )
  }

  return (
    <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background">
      {qualifiers.map((athlete) => {
        const isMe = athlete.athleteId === currentUserAthleteId
        return (
        <div key={athlete.athleteId} className={`px-4 py-2 ${isMe ? "bg-amber-50" : ""}`}>
          <div className="flex items-center gap-3 group">
            <Link
              href={athletePath(athlete.athleteSlug ?? athlete.athleteId)}
              className="w-9 h-9 rounded-full bg-primary-bg flex items-center justify-center text-sm font-medium text-primary shrink-0 transition-colors"
            >
              {athlete.firstName[0]}
              {athlete.lastName[0]}
            </Link>
            <div className="flex-1 min-w-0 flex items-baseline gap-3">
              <Link
                href={athletePath(athlete.athleteSlug ?? athlete.athleteId)}
                className="font-medium text-sm text-foreground group-hover:text-primary transition-colors"
              >
                {athlete.lastName}, {athlete.firstName}
              </Link>
              <p className="text-[11px] uppercase tracking-wide text-foreground-tertiary">
                {athlete.gender === "F" ? "Women" : "Men"} · {athlete.events.length} event
                {athlete.events.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <ul className="mt-1 space-y-1 pl-12">
            {athlete.events.map((ev) => {
                const content = (
                  <>
                    <div className="min-w-0">
                      <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {ev.event}
                      </span>
                      <span className="text-foreground-secondary group-hover:text-primary transition-colors">
                        {" "}
                        · {ev.meetName}
                        {" "}
                        · {ev.date}
                      </span>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <span className="font-medium text-success group-hover:text-primary transition-colors">
                        {ev.time}
                      </span>
                      <span className="text-xs text-foreground-tertiary group-hover:text-primary transition-colors">
                        {" "}
                        / {ev.cut}
                      </span>
                    </div>
                  </>
                )

                return ev.meetId ? (
                  <li
                    key={`${athlete.athleteId}-${ev.event}`}
                  >
                    <Link
                      href={ev.meetSlug ? meetSwimPath(ev.meetSlug, ev.id) : `/meets/${ev.meetId}#swim-${ev.id}`}
                      className="flex items-baseline justify-between gap-3 text-sm -mx-2 px-2 py-1 rounded transition-colors group"
                    >
                      {content}
                    </Link>
                  </li>
                ) : (
                  <li
                    key={`${athlete.athleteId}-${ev.event}`}
                    className="flex items-baseline justify-between gap-3 text-sm px-2 py-1"
                  >
                    {content}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}


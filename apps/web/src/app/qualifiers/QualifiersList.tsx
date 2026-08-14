import Link from "next/link"
import { athletePreferredInitials, athletePreferredNameLastFirst } from "@swimbuzz/shared"
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
      <div className="rounded-xl border border-dashed border-border-secondary bg-background px-5 py-7 text-center">
        <p className="text-sm font-medium text-foreground">No qualifying athletes yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-foreground-secondary">{emptyMessage}</p>
      </div>
    )
  }

  const galleryQualifiers = [...qualifiers].sort((a, b) => {
    const byLastName = a.lastName.localeCompare(b.lastName)
    return byLastName || a.firstName.localeCompare(b.firstName)
  })
  const availableLetters = Array.from(
    new Set(galleryQualifiers.map((athlete) => athlete.lastName[0]?.toUpperCase() || "#"))
  )

  if (view === "gallery") {
    return (
      <div className="space-y-4">
        <nav aria-label="Jump to qualifier by last name" className="flex gap-2 overflow-x-auto rounded-xl bg-background p-2">
          {availableLetters.map((letter) => (
            <a
              key={letter}
              href={`#${letter}`}
              className="whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-primary"
            >
              {letter}
            </a>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {galleryQualifiers.map((athlete, index) => {
            const letter = athlete.lastName[0]?.toUpperCase() || "#"
            const previousLetter = galleryQualifiers[index - 1]?.lastName[0]?.toUpperCase() || null
            const startsLetterSection = letter !== previousLetter
            return (
              <div
                key={athlete.athleteId}
                id={startsLetterSection ? letter : undefined}
                className={startsLetterSection ? "scroll-mt-32" : undefined}
              >
                <QualifierGalleryCard athlete={athlete} currentUserAthleteId={currentUserAthleteId} />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="hidden grid-cols-[minmax(10.5rem,1fr)_minmax(6.5rem,8rem)_minmax(9rem,26rem)_minmax(5.5rem,6.5rem)_4.75rem_5.25rem] gap-2 border-b border-border bg-fill-secondary/60 px-5 py-2 text-[11px] font-semibold tracking-[0.11em] text-foreground-tertiary md:grid">
        <span>ATHLETE</span>
        <span className="pl-2.5">EVENT</span>
        <span className="pl-2.5">MEET</span>
        <span className="pl-2.5 text-left">DATE</span>
        <span className="pl-2.5 text-left">TIME</span>
        <span className="pl-2.5 text-left">STANDARD</span>
      </div>
      <div className="divide-y divide-border">
        {qualifiers.map((athlete) => {
          const isMe = athlete.athleteId === currentUserAthleteId
          const athleteHref = athletePath(athlete.athleteSlug ?? athlete.athleteId)
          return (
            <article
              key={athlete.athleteId}
              className={`grid gap-3 px-4 py-2 transition-colors sm:px-5 md:grid-cols-[minmax(10.5rem,1fr)_minmax(6.5rem,8rem)_minmax(9rem,26rem)_minmax(5.5rem,6.5rem)_4.75rem_5.25rem] md:gap-2 ${
                isMe ? "bg-primary-bg/60" : "hover:bg-fill-secondary/40"
              }`}
            >
                <div className="flex items-start gap-2.5">
                <Link
                  href={athleteHref}
                  aria-label={`View ${athletePreferredNameLastFirst(athlete)}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-text"
                >
                  {athletePreferredInitials(athlete)}
                </Link>
                <div className="min-w-0 pt-0.5">
                  <Link
                    href={athleteHref}
                    className="font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                  >
                    {athletePreferredNameLastFirst(athlete)}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-secondary">
                    {isMe ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-text">You</span>
                    ) : null}
                    <span>{athlete.gender === "F" ? "Women" : "Men"}</span>
                    <span aria-hidden="true" className="text-foreground-tertiary">•</span>
                    <span>{athlete.events.length} {athlete.events.length === 1 ? "cut" : "cuts"}</span>
                  </div>
                </div>
              </div>

              <div className="min-w-0 space-y-0.5 md:col-span-5">
                {athlete.events.map((event) => {
                  const eventContent = (
                    <>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                          {event.event}
                        </p>
                      </div>
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <p className="truncate text-sm font-medium text-foreground-secondary transition-colors group-hover:text-primary">
                          {event.meetName || "Qualifying swim"}
                        </p>
                      </div>
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <p className="truncate text-sm font-medium text-foreground-secondary transition-colors group-hover:text-primary">
                          {event.date || "—"}
                        </p>
                      </div>
                      <div className="col-start-2 row-start-1 shrink-0 md:col-auto md:row-auto">
                        <p className="font-mono text-sm font-medium tabular-nums text-success transition-colors group-hover:text-primary">
                          {event.time}
                        </p>
                      </div>
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <p className="truncate font-mono text-sm font-medium tabular-nums text-foreground-secondary transition-colors group-hover:text-primary">
                          {event.cut ?? "—"}
                        </p>
                      </div>
                    </>
                  )
                  const rowClass = "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md px-2.5 py-1 transition-colors md:grid-cols-[minmax(6.5rem,8rem)_minmax(9rem,26rem)_minmax(5.5rem,6.5rem)_4.75rem_5.25rem] md:gap-2"
                  return event.meetId ? (
                    <Link
                      key={`${athlete.athleteId}-${event.event}-${event.id}`}
                      href={event.meetSlug ? meetSwimPath(event.meetSlug, event.id) : `/meets/${event.meetId}#swim-${event.id}`}
                      className={`${rowClass} hover:bg-primary-bg/70`}
                    >
                      {eventContent}
                    </Link>
                  ) : (
                    <div key={`${athlete.athleteId}-${event.event}-${event.id}`} className={`${rowClass} bg-fill-secondary/45`}>
                      {eventContent}
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

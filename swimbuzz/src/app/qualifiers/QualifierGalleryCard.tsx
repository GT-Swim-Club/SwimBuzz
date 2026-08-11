"use client"

import { useState } from "react"
import Link from "next/link"
import type { QualifierAthlete } from "@/lib/nationals-qualifiers"
import { athletePath, meetSwimPath } from "@/lib/slug"

export default function QualifierGalleryCard({ athlete, currentUserAthleteId }: { athlete: QualifierAthlete, currentUserAthleteId?: string | null }) {
  const [showAll, setShowAll] = useState(false)
  const events = showAll ? athlete.events : athlete.events.slice(0, 3)
  const isMe = athlete.athleteId === currentUserAthleteId

  return (
    <div
      className={`block rounded-xl overflow-hidden border border-border bg-background p-4 flex flex-col items-center text-center h-full shadow-sm hover:shadow-md transition-all ${isMe ? "bg-amber-50" : ""}`}
    >
      <Link
        href={athletePath(athlete.athleteSlug ?? athlete.athleteId)}
        className="group flex flex-col items-center"
      >
        <div className="h-16 w-16 rounded-full overflow-hidden border border-primary/30 bg-primary/20 mb-3 flex items-center justify-center text-lg font-semibold text-primary shrink-0 transition-colors">
          {athlete.firstName[0]}
          {athlete.lastName[0]}
        </div>
      <h3 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
        {athlete.firstName}
        {" "}
        {athlete.lastName}
      </h3>
      </Link>
      <div className="mt-3 w-full text-left space-y-1">
        {events.map((ev) => {
          const content = (
            <div key={ev.event} className="flex justify-between text-[11px] group">
              <span className="text-foreground-secondary truncate max-w-[60%] group-hover:text-primary transition-colors">{ev.event}</span>
              <span className="font-medium text-foreground tabular-nums group-hover:text-primary transition-colors">{ev.time}</span>
            </div>
          )

          if (ev.meetId) {
            return (
              <Link
                key={ev.event}
                href={ev.meetSlug ? meetSwimPath(ev.meetSlug, ev.id) : ev.meetId ? `/meets/${ev.meetId}#swim-${ev.id}` : "#"}
                className="block rounded -mx-1 px-1 transition-colors"
              >
                {content}
              </Link>
            )
          }

          return content
        })}
        {athlete.events.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full text-[11px] text-primary text-center pt-1 hover:underline"
          >
            {showAll ? "Show less" : `+${athlete.events.length - 3} more`}
          </button>
        )}
      </div>
    </div>
  )
}

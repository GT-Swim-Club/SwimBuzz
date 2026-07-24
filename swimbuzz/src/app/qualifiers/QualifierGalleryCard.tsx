"use client"

import { useState } from "react"
import Link from "next/link"
import type { QualifierAthlete } from "@/lib/nationals-qualifiers"

export default function QualifierGalleryCard({ athlete }: { athlete: QualifierAthlete }) {
  const [showAll, setShowAll] = useState(false)
  const events = showAll ? athlete.events : athlete.events.slice(0, 3)

  return (
    <div
      className="group block rounded-xl overflow-hidden border border-border bg-background p-4 flex flex-col items-center text-center h-full shadow-sm hover:shadow-md transition-all"
    >
      <Link
        href={`/athletes/${athlete.athleteId}`}
        className="flex flex-col items-center"
      >
        <div className="h-16 w-16 rounded-full overflow-hidden border border-primary/30 bg-primary/20 mb-3 flex items-center justify-center text-lg font-semibold text-primary shrink-0">
          {athlete.firstName[0]}
          {athlete.lastName[0]}
        </div>
      <h3 className="font-medium text-sm text-foreground">
        {athlete.firstName}
        {athlete.nicknames.length > 0 && (
          <span className="font-normal text-foreground-secondary">
            {" "}
            ({athlete.nicknames.join(", ")})
          </span>
        )}
        {" "}
        {athlete.lastName}
      </h3>
      </Link>
      <div className="mt-3 w-full text-left space-y-1">
        {events.map((ev) => (
          <div key={ev.event} className="flex justify-between text-[11px]">
            <span className="text-foreground-secondary truncate max-w-[60%]">{ev.event}</span>
            <span className="font-medium text-foreground tabular-nums">{ev.time}</span>
          </div>
        ))}
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

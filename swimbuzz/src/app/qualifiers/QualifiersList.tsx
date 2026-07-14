import Link from "next/link"
import type { QualifierAthlete } from "@/lib/nationals-qualifiers"

export default function QualifiersList({
  qualifiers,
  emptyMessage,
}: {
  qualifiers: QualifierAthlete[]
  emptyMessage: string
}) {
  if (qualifiers.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-zinc-400 px-4 py-8 text-center border rounded-xl bg-white dark:bg-zinc-900">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="divide-y border rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
      {qualifiers.map((athlete) => (
        <div key={athlete.athleteId} className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-700 shrink-0 dark:bg-indigo-950 dark:text-indigo-300">
              {athlete.firstName[0]}
              {athlete.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <Link
                href={`/athletes/${athlete.athleteId}`}
                className="font-medium text-sm text-gray-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400"
              >
                {athlete.lastName}, {athlete.firstName}
              </Link>
              <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-zinc-500">
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
                  <span className="font-medium text-gray-900 dark:text-zinc-100">
                    {ev.event}
                  </span>
                  <span className="text-gray-500 dark:text-zinc-400">
                    {" "}
                    · {ev.meetName}
                    {ev.meetId ? (
                      <>
                        {" "}
                        (
                        <Link
                          href={`/meets/${ev.meetId}`}
                          className="hover:text-indigo-600 dark:hover:text-indigo-400"
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
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {ev.time}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">
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

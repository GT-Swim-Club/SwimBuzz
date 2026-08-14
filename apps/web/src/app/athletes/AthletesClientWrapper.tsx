"use client"

import { useMemo } from "react"
import Link from "next/link"
import AthleteGalleryCard from "./AthleteGalleryCard"
import { athletePath } from "@/lib/slug"
import { formatAthleteYearAndAge } from "@/lib/utils"
export default function AthletesClientWrapper({
  athletes,
  viewerAthleteId,
  showGender,
  query,
  view,
}: {
  athletes: any[]
  viewerAthleteId: string | null
  showGender: boolean
  query: string
  view: "list" | "gallery"
}) {

  if (athletes.length === 0) {
    return (
    <div className="border border-border-secondary rounded-xl px-4 py-12 text-center text-sm text-foreground-secondary bg-background">
        {query
          ? `No athletes matching “${query}”.`
          : `No athletes found for this ${showGender ? "season" : "gender and season"}.`}
      </div>
    )
  }

  const { groupedAthletes, viewerAthlete, others } = useMemo(() => {
    const you = athletes.find((a) => a.id === viewerAthleteId)
    const others = athletes.filter((a) => a.id !== viewerAthleteId)

    const groups: Record<string, typeof athletes> = {}
    for (const a of others) {
      const letter = a.lastName[0]?.toUpperCase() || "#"
      if (!groups[letter]) groups[letter] = []
      groups[letter].push(a)
    }
    return {
      groupedAthletes: Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)),
      viewerAthlete: you,
      others,
    }
  }, [athletes, viewerAthleteId])

  const viewerYearAndAge = viewerAthlete
    ? formatAthleteYearAndAge(viewerAthlete.year, viewerAthlete.dob)
    : null

  const availableLetters = useMemo(
    () => groupedAthletes.map(([letter]) => letter),
    [groupedAthletes]
  )

  const renderNav = () => (
    <div className="flex gap-2 p-2 bg-background rounded-xl overflow-x-auto">
      {availableLetters.map((letter) => (
        <a
          key={letter}
          href={`#${letter}`}
          className="px-2 py-1 text-xs font-medium text-foreground-secondary hover:text-primary hover:bg-fill-secondary rounded transition-colors whitespace-nowrap"
        >
          {letter}
        </a>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      {renderNav()}
      {view === "list" ? (
        <div className="space-y-6">
          {viewerAthlete && (
            <div id="You" className="scroll-mt-32">
              <h2 className="text-sm font-semibold text-foreground-tertiary px-4 mb-2">You</h2>
              <Link
                href={athletePath(viewerAthlete.slug ?? viewerAthlete.id)}
                className="rounded-xl border border-border-secondary border-primary bg-primary/5 shadow-sm p-6 flex items-center gap-6 hover:shadow-md transition-shadow"
              >
                <div className="h-20 w-20 rounded-full overflow-hidden border border-primary/30 bg-primary/20 shrink-0">
                  {viewerAthlete.user?.image ? (
                    <img
                      src={viewerAthlete.user.image}
                      alt={`${viewerAthlete.firstName} ${viewerAthlete.lastName}`}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-primary">
                      {viewerAthlete.firstName[0]}
                      {viewerAthlete.lastName[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-0.5">
                  <h3 className="text-xl font-semibold text-foreground">
                    {viewerAthlete.firstName}
                    {" "}
                    {viewerAthlete.lastName}
                    {viewerAthlete.nicknames.length > 0 && (
                      <span className="ml-2 font-normal text-foreground-secondary text-sm">
                        ({viewerAthlete.nicknames.join(", ")})
                      </span>
                    )}
                  </h3>
                  <div className="text-sm text-foreground-secondary space-y-0.5">
                    {viewerAthlete.user?.email && <p>{viewerAthlete.user.email}</p>}
                    {viewerYearAndAge && <p>{viewerYearAndAge}</p>}
                  </div>
                </div>
                {showGender && (
                  <p className="ml-auto font-medium uppercase tracking-wide text-foreground-tertiary">
                    {viewerAthlete.gender === "F" ? "Women" : "Men"}
                  </p>
                )}
              </Link>
            </div>
          )}
          {groupedAthletes.map(([letter, athletesInGroup]) => (
            <div key={letter} id={letter} className="scroll-mt-32">
              <h2 className="text-sm font-semibold text-foreground-tertiary px-4 mb-2">{letter}</h2>
              <div className="rounded-xl overflow-hidden border border-border bg-background shadow-sm divide-y divide-border">
                {athletesInGroup.map((a) => {
                  const isYou = a.id === viewerAthleteId
                  const yearAndAge = formatAthleteYearAndAge(a.year, a.dob)
                  return (
                    <Link
                      key={a.id}
                      href={athletePath(a.slug ?? a.id)}
                      className={
                        "flex items-center gap-4 px-4 py-3 hover:bg-fill-secondary transition-colors" +
                        (isYou ? " bg-primary/20" : "")
                      }
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/20 text-sm font-medium text-primary">
                        {a.user?.image ? (
                          <img
                            src={a.user.image}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span aria-hidden>
                            {a.firstName[0]}
                            {a.lastName[0]}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground">
                          {a.lastName}, {a.firstName}
                          {a.nicknames.length > 0 && (
                            <span className="font-normal text-foreground-secondary">
                              {" "}({a.nicknames.join(", ")})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                          {yearAndAge && (
                            <span className="text-foreground-secondary text-xs">
                              {yearAndAge}
                            </span>
                          )}
                          {showGender ? (
                            <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
                              {a.gender === "F" ? "Women" : "Men"}
                            </span>
                          ) : null}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {viewerAthlete && (
            <div id="You" className="scroll-mt-32">
              <h2 className="text-sm font-semibold text-foreground-tertiary px-4 mb-2">You</h2>
              <Link
                href={athletePath(viewerAthlete.slug ?? viewerAthlete.id)}
                className="rounded-xl border border-border-secondary border-primary bg-primary/5 shadow-sm p-6 flex items-center gap-6 hover:shadow-md transition-shadow"
              >
                <div className="h-20 w-20 rounded-full overflow-hidden border border-primary/30 bg-primary/20 shrink-0">
                  {viewerAthlete.user?.image ? (
                    <img
                      src={viewerAthlete.user.image}
                      alt={`${viewerAthlete.firstName} ${viewerAthlete.lastName}`}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-primary">
                      {viewerAthlete.firstName[0]}
                      {viewerAthlete.lastName[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-0.5">
                  <h3 className="text-xl font-semibold text-foreground">
                    {viewerAthlete.firstName}
                    {" "}
                    {viewerAthlete.lastName}
                    {viewerAthlete.nicknames.length > 0 && (
                      <span className="ml-2 font-normal text-foreground-secondary text-sm">
                        ({viewerAthlete.nicknames.join(", ")})
                      </span>
                    )}
                  </h3>
                  <div className="text-sm text-foreground-secondary space-y-0.5">
                    {viewerAthlete.user?.email && <p>{viewerAthlete.user.email}</p>}
                    {viewerYearAndAge && <p>{viewerYearAndAge}</p>}
                  </div>
                </div>
                {showGender && (
                  <p className="ml-auto font-medium uppercase tracking-wide text-foreground-tertiary">
                    {viewerAthlete.gender === "F" ? "Women" : "Men"}
                  </p>
                )}
              </Link>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-4">
            {others.map((a, index, arr) => {
              const letter = a.lastName[0]?.toUpperCase() || "#";
              const prevLetter = arr[index - 1]?.lastName[0]?.toUpperCase() || null;
              const belongsToNewLetterSection = letter !== prevLetter;
              
              if (belongsToNewLetterSection) {
                  return (
                      <div key={a.id} id={letter} className="scroll-mt-32 col-span-1 h-full">
                          <AthleteGalleryCard athlete={a} showGender={showGender} isYou={false} />
                      </div>
                  )
              }
              return (
                  <div key={a.id} className="h-full col-span-1">
                          <AthleteGalleryCard athlete={a} showGender={showGender} isYou={false} />
                  </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

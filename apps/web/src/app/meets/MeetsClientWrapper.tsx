"use client"

import { useState } from "react"
import Link from "next/link"
import { formatSeasonLabel } from "@swimbuzz/shared"
import { RelativeDateRange } from "@/components/ui/RelativeDate"
import MeetGalleryCard from "./MeetGalleryCard"
import EditMeetButton from "./EditMeetButton"
import { type MeetFormState } from "./MeetFields"
import { meetPath } from "@/lib/slug"
import MeetCountdown from "@/components/meet/MeetCountdown"
import { toDateInput, toTimeInput } from "@/lib/date-input"

export default function MeetsClientWrapper({
  meets,
  bySeason,
  seasons,
  isCoach,
  query,
  view,
}: {
  meets: any[] // TODO: Import types properly or use a more descriptive type
  bySeason: Record<string, any[]>
  seasons: string[]
  isCoach: boolean
  query: string
  view: "list" | "gallery"
}) {
  const now = Date.now()

  if (meets.length === 0) {
    return (
        <div className="border border-border border-border-secondary-secondary rounded-xl px-4 py-12 text-center text-sm text-foreground-secondary bg-background">
          {query
            ? "No meets match your search."
            : `No meets yet.${isCoach ? " Create one to start tracking results." : ""}`}
        </div>
    )
  }


  return (
    <div className="space-y-8">
      <div className="space-y-8">
        {seasons.map((season) => {
          const seasonMeets = bySeason[season] ?? []
          return (
            <section key={season} className="space-y-3">
              <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
                {formatSeasonLabel(season)}
                <span className="ml-2 font-normal normal-case tracking-normal text-foreground-tertiary">
                  {seasonMeets.length} meet{seasonMeets.length === 1 ? "" : "s"}
                </span>
              </h2>

              {view === "list" ? (
                <div className="divide-y divide-border-secondary border border-border border-border-secondary-secondary rounded-xl overflow-hidden bg-background">
                  {seasonMeets.map((m: any) => {
                    const end = m.endsAt ?? m.startsAt
                    const upcoming = new Date(end).getTime() >= now
                    const athleteCount = m.athleteCount ?? 0
                    const initial: MeetFormState = {
                      name: m.name,
                      location: m.location ?? "",
                      startDate: toDateInput(m.startsAt, m.timeZone),
                      startTime: m.hasStartTime ? toTimeInput(m.startsAt, m.timeZone) : "",
                      timeZone: m.timeZone,
                      endDate: toDateInput(m.endsAt, m.timeZone),
                      course: m.course,
                      season: m.season,
                      school: m.school ?? "",
                      iconUrl: m.iconUrl ?? "",
                      bannerUrl: m.bannerUrl ?? "",
                      packetUrl: m.packetUrl ?? "",
                      psychSheetUrl: m.psychSheetUrl ?? "",
                      heatSheetUrl: m.heatSheetUrl ?? "",
                      resultsUrl: m.resultsUrl ?? "",
                    }
                    return (
                      <div key={m.id} className="flex items-center gap-4 px-4 py-3 dark:hover:bg-zinc-800 hover:dark:bg-background bg-background transition-colors">
                        <Link href={meetPath(m.slug ?? m.id)} className="flex-1 flex items-center gap-4 min-w-0">
                          {m.iconUrl && (
                            <img
                              src={m.iconUrl}
                              alt={`${m.name} icon`}
                              className="h-10 w-10 rounded-lg object-cover shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm text-foreground truncate">
                                {m.name}
                              </p>
                              {upcoming && m.hasStartTime && (
                                <MeetCountdown
                                  startsAt={m.startsAt}
                                  upcoming
                                />
                              )}
                            </div>
                            <p className="text-xs text-foreground-secondary">
                              <RelativeDateRange
                                startsAt={m.startsAt}
                                endsAt={m.endsAt}
                                timeZone={m.timeZone}
                              />
                              {m.location ? ` · ${m.location}` : ""}
                              {m.school ? ` · ${m.school}` : ""}
                            </p>
                          </div>
                        </Link>
                        <div className="text-right shrink-0 flex items-center gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground-secondary">
                              {m.course}
                            </p>
                            <p className="text-xs text-foreground-tertiary">
                              {athleteCount} athlete{athleteCount === 1 ? "" : "s"}
                            </p>
                          </div>
                          {isCoach && <EditMeetButton meetId={m.id} initial={initial} seasons={seasons} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {seasonMeets.map((m: any) => {
                    const end = m.endsAt ?? m.startsAt
                    const upcoming = new Date(end).getTime() >= now
                    const initial: MeetFormState = {
                      name: m.name,
                      location: m.location ?? "",
                      startDate: toDateInput(m.startsAt, m.timeZone),
                      startTime: m.hasStartTime ? toTimeInput(m.startsAt, m.timeZone) : "",
                      timeZone: m.timeZone,
                      endDate: toDateInput(m.endsAt, m.timeZone),
                      course: m.course,
                      season: m.season,
                      school: m.school ?? "",
                      iconUrl: m.iconUrl ?? "",
                      bannerUrl: m.bannerUrl ?? "",
                      packetUrl: m.packetUrl ?? "",
                      psychSheetUrl: m.psychSheetUrl ?? "",
                      heatSheetUrl: m.heatSheetUrl ?? "",
                      resultsUrl: m.resultsUrl ?? "",
                    }
                    return (
                      <MeetGalleryCard key={m.id} meet={m} upcoming={upcoming} isCoach={isCoach} initial={initial} seasons={seasons} />
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

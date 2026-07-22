"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDateRange } from "@/lib/utils"
import { countMeetAthletes } from "@/lib/meet-sheet-summary"
import MeetGalleryCard from "./MeetGalleryCard"
import EditMeetButton from "./EditMeetButton"
import { type MeetFormState } from "./MeetFields"

function toDateInput(d: Date | null | undefined): string {
  if (!d) return ""
  return new Date(d).toISOString().slice(0, 10)
}

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
                {season}
                <span className="ml-2 font-normal normal-case tracking-normal text-foreground-tertiary">
                  {seasonMeets.length} meet{seasonMeets.length === 1 ? "" : "s"}
                </span>
              </h2>

              {view === "list" ? (
                <div className="divide-y divide-border-secondary border border-border border-border-secondary-secondary rounded-xl overflow-hidden bg-background">
                  {seasonMeets.map((m: any) => {
                    const end = m.endDate ?? m.startDate
                    const upcoming = new Date(end).getTime() >= now
                    const athleteCount = countMeetAthletes({
                      psychSheetSummary: m.psychSheetSummary,
                      heatSheetSummary: m.heatSheetSummary,
                      entriesSheetSummary: m.entriesSheetSummary,
                      relayResultsSummary: m.relayResultsSummary,
                      resultStatusesSummary: m.resultStatusesSummary,
                      swimAthleteIds: m.swims.map((s: any) => s.athleteId),
                    })
                    const initial: MeetFormState = {
                      name: m.name,
                      location: m.location ?? "",
                      startDate: toDateInput(m.startDate),
                      endDate: toDateInput(m.endDate),
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
                        <Link href={`/meets/${m.id}`} className="flex-1 flex items-center gap-4 min-w-0">
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
                              {upcoming && (
                                <span className="text-[10px] uppercase font-semibold tracking-wide rounded-full bg-primary/90 text-primary-text px-2 py-0.5">
                                  Upcoming
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-foreground-secondary">
                              {formatDateRange(m.startDate, m.endDate)}
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
                          {isCoach && <EditMeetButton meetId={m.id} initial={initial} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {seasonMeets.map((m: any) => {
                    const end = m.endDate ?? m.startDate
                    const upcoming = new Date(end).getTime() >= now
                    const initial: MeetFormState = {
                      name: m.name,
                      location: m.location ?? "",
                      startDate: toDateInput(m.startDate),
                      endDate: toDateInput(m.endDate),
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
                      <MeetGalleryCard key={m.id} meet={m} upcoming={upcoming} isCoach={isCoach} initial={initial} />
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

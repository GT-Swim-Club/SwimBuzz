"use client"

import { useOptimistic, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { formatSeasonLabel } from "@swimbuzz/shared"
import FluidToolbar from "@/components/ui/FluidToolbar"
import ToolbarSelect from "@/components/ui/ToolbarSelect"
import { ListLayoutToggle, useListLayout } from "@/components/ui/ListLayout"
import type { QualifierAthlete } from "@/lib/qualifiers/nationals-qualifiers"
import { groupQualifiersByEvent } from "@/lib/qualifiers/qualifier-events"
import StandardsTableModal from "./StandardsTableModal"
import UploadStandardsButton from "./UploadStandardsButton"
import QualifiersList from "./QualifiersList"
import QualifierGalleryCard from "./QualifierGalleryCard"
import QualifierEventList from "./QualifierEventList"
import QualifierEventCard from "./QualifierEventCard"

type Gender = "all" | "M" | "F"

const GENDER_LABELS: Record<Gender, string> = { all: "All", M: "Men", F: "Women" }
const galleryGridClass = "grid grid-cols-[repeat(auto-fill,minmax(max(220px,calc((100%-36px)/4)),1fr))] gap-3"

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border-secondary bg-background px-5 py-7 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-foreground-secondary">{message}</p>
    </div>
  )
}

/**
 * The Nationals page below the nav: toolbar, then qualifiers by athlete or by
 * event in the gallery or list layout. The server loads one season (every
 * gender); gender, grouping and search live in the URL but update it in place
 * and filter here, so changing them is instant. Season changes refetch.
 */
export default function QualifiersView({
  season,
  seasons,
  standards,
  qualifiers,
  eventRank,
  currentAthleteId,
  isCoach,
}: {
  season: string
  seasons: string[]
  standards: { yearLabel: string | null; sourceUrl: string | null; course: string } | null
  qualifiers: QualifierAthlete[]
  eventRank: Record<string, number>
  currentAthleteId: string | null
  isCoach: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { layout } = useListLayout()
  const [, startTransition] = useTransition()
  const [shownSeason, setShownSeason] = useOptimistic(season)

  const genderParam = searchParams.get("gender")
  const gender: Gender = genderParam === "M" || genderParam === "F" ? genderParam : "all"
  const byEvent = searchParams.get("group") === "event"
  const query = searchParams.get("q")?.trim() ?? ""
  const seasonLabel = formatSeasonLabel(season)

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    return `/qualifiers?${params.toString()}`
  }

  function changeSeason(next: string) {
    startTransition(() => {
      setShownSeason(next)
      router.replace(setParams({ season: next }))
    })
  }

  const base = gender === "all" ? qualifiers : qualifiers.filter((athlete) => athlete.gender === gender)
  const needle = query.toLowerCase()
  const nameMatches = (athlete: QualifierAthlete) =>
    [athlete.firstName, athlete.lastName, athlete.preferredName ?? ""].some((name) =>
      name.toLowerCase().includes(needle)
    )
  const eventMatches = (event: string) => event.toLowerCase().includes(needle)

  const athletes = base
    .filter((athlete) => !needle || nameMatches(athlete) || athlete.events.some((e) => eventMatches(e.event)))
    // You first in the list; the gallery stays alphabetical.
    .sort((a, b) => Number(b.athleteId === currentAthleteId) - Number(a.athleteId === currentAthleteId))
  const galleryAthletes = [...athletes].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  )
  const eventGroups = byEvent
    ? groupQualifiersByEvent(base, eventRank, {
        splitGender: gender === "all",
        includeSwim: ({ athlete, swim }) => !needle || nameMatches(athlete) || eventMatches(swim.event),
      })
    : []

  const genderNoun = gender === "F" ? "women " : gender === "M" ? "men " : ""
  const placeholder = `Search ${base.length} ${genderNoun}qualifier${base.length === 1 ? "" : "s"}…`
  const isEmpty = byEvent ? eventGroups.length === 0 : athletes.length === 0

  let content
  if (!standards) {
    content = (
      <EmptyState
        title={`No standards for ${seasonLabel}`}
        message="The qualifying-times PDF hasn't been uploaded yet."
      />
    )
  } else if (isEmpty) {
    content = query ? (
      <EmptyState title="No matches" message={`No qualifiers match “${query}”.`} />
    ) : (
      <EmptyState
        title="No qualifying athletes yet"
        message="No athletes have an individual Nationals cut in this season yet."
      />
    )
  } else if (byEvent) {
    content =
      layout === "list" ? (
        <QualifierEventList groups={eventGroups} splitGender={gender === "all"} currentAthleteId={currentAthleteId} />
      ) : (
        <div className={galleryGridClass}>
          {eventGroups.map((group) => (
            <QualifierEventCard
              key={group.key}
              group={group}
              splitGender={gender === "all"}
              currentAthleteId={currentAthleteId}
            />
          ))}
        </div>
      )
  } else {
    content =
      layout === "list" ? (
        <QualifiersList qualifiers={athletes} currentAthleteId={currentAthleteId} />
      ) : (
        <div className={galleryGridClass}>
          {galleryAthletes.map((athlete) => (
            <QualifierGalleryCard
              key={athlete.athleteId}
              athlete={athlete}
              isMe={athlete.athleteId === currentAthleteId}
            />
          ))}
        </div>
      )
  }

  return (
    <>
      <FluidToolbar
        pathname="/qualifiers"
        placeholder={placeholder}
        searchLabel="Search qualifiers"
        shallow
        controls={
          <>
            {standards?.sourceUrl ? (
              <StandardsTableModal yearLabel={standards.yearLabel} sourceUrl={standards.sourceUrl} />
            ) : null}
            <ToolbarSelect
              label="Gender"
              icon="roster"
              current={GENDER_LABELS[gender]}
              active={gender !== "all"}
              value={gender}
              onChange={(v) => window.history.replaceState(null, "", setParams({ gender: v === "all" ? null : v }))}
            >
              <option value="all">All</option>
              <option value="F">Women</option>
              <option value="M">Men</option>
            </ToolbarSelect>
            <ToolbarSelect
              label="Season"
              icon="calendar"
              current={formatSeasonLabel(shownSeason)}
              active={false}
              value={shownSeason}
              onChange={changeSeason}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {formatSeasonLabel(s)}
                </option>
              ))}
            </ToolbarSelect>
            <ToolbarSelect
              label="Group by"
              icon="eventOrder"
              current={byEvent ? "By event" : "By athlete"}
              active={byEvent}
              value={byEvent ? "event" : "athlete"}
              onChange={(v) => window.history.replaceState(null, "", setParams({ group: v === "event" ? "event" : null }))}
            >
              <option value="athlete">By athlete</option>
              <option value="event">By event</option>
            </ToolbarSelect>
            <ListLayoutToggle />
            {isCoach ? <UploadStandardsButton season={season} course={standards?.course ?? "SCY"} /> : null}
          </>
        }
      />
      {content}
    </>
  )
}

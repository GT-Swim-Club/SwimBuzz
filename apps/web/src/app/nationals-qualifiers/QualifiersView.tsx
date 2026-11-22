"use client"

import type { ReactNode } from "react"
import { useOptimistic, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { formatSeasonLabel } from "@swimbuzz/shared"
import FluidToolbar from "@/components/ui/FluidToolbar"
import ToolbarSelect from "@/components/ui/ToolbarSelect"
import { ListLayoutToggle, useListLayout } from "@/components/ui/ListLayout"
import JumpRail, { JUMP_RAIL_LAYOUT_CLASS, JUMP_RAIL_LETTERS } from "@/components/ui/JumpRail"
import type { QualifierAthlete } from "@/lib/qualifiers/nationals-qualifiers"
import {
  parseQualifierGender,
  selectQualifierView,
  type QualifierGenderFilter,
} from "@/lib/qualifiers/qualifier-events"
import StandardsTableModal from "./StandardsTableModal"
import DownloadQualifiersPdfButton from "./DownloadQualifiersPdfButton"
import UploadStandardsButton from "./UploadStandardsButton"
import QualifiersList from "./QualifiersList"
import QualifierGalleryCard from "./QualifierGalleryCard"
import QualifierEventList from "./QualifierEventList"
import QualifierEventCard from "./QualifierEventCard"

const GENDER_LABELS: Record<QualifierGenderFilter, string> = { all: "All", M: "Men", F: "Women" }
const galleryGridClass = "grid grid-cols-[repeat(auto-fill,minmax(max(min(300px,100%),calc((100%-36px)/4)),1fr))] gap-3"

function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-secondary bg-background px-5 py-7 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-foreground-secondary">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
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

  const gender = parseQualifierGender(searchParams.get("gender"))
  const byEvent = searchParams.get("group") === "event"
  const query = searchParams.get("q")?.trim() ?? ""
  const seasonLabel = formatSeasonLabel(season)

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    return `/nationals-qualifiers?${params.toString()}`
  }

  function changeSeason(next: string) {
    startTransition(() => {
      setShownSeason(next)
      router.replace(setParams({ season: next }))
    })
  }

  const view = selectQualifierView(qualifiers, { gender, query, byEvent, eventRank })
  const { base, eventGroups } = view
  // Alphabetical from the server, with you first — the same order in both layouts.
  const athletes = [...view.athletes].sort(
    (a, b) => Number(b.athleteId === currentAthleteId) - Number(a.athleteId === currentAthleteId)
  )

  // The A–Z rail (by athlete): the first athlete under each last-name letter is its target. You lead
  // the list out of order, so you're never one.
  const anchorIds = new Map<string, string>()
  for (const athlete of athletes) {
    if (athlete.athleteId === currentAthleteId) continue
    const letter = athlete.lastName.trim()[0]?.toUpperCase()
    if (!letter || !JUMP_RAIL_LETTERS.includes(letter)) continue
    const id = `qualifiers-${letter}`
    if (![...anchorIds.values()].includes(id)) anchorIds.set(athlete.athleteId, id)
  }
  const railTargets = new Set(anchorIds.values())
  const railItems = JUMP_RAIL_LETTERS.map((letter) => ({
    key: letter,
    label: letter,
    targetId: railTargets.has(`qualifiers-${letter}`) ? `qualifiers-${letter}` : undefined,
  }))

  const genderNoun = gender === "F" ? "women " : gender === "M" ? "men " : ""
  const placeholder = `Search ${base.length} ${genderNoun}qualifier${base.length === 1 ? "" : "s"}…`
  const isEmpty = byEvent ? eventGroups.length === 0 : athletes.length === 0
  const showGender = gender === "all"


  let content
  if (!standards) {
    content = isCoach ? (
      <EmptyState
        title={`No standards for ${seasonLabel}`}
        message="Upload the Nationals qualifying-times PDF to see who has made a cut."
        action={<UploadStandardsButton season={season} variant="text" />}
      />
    ) : (
      <EmptyState
        title={`No standards for ${seasonLabel}`}
        message={`Coaches haven't uploaded the Nationals qualifying times for ${seasonLabel} yet.`}
      />
    )
  } else if (isEmpty) {
    content = query ? (
      <EmptyState title="No matching qualifiers" message={`No qualifiers match “${query}”.`} />
    ) : (
      <EmptyState
        title="No qualifying athletes yet"
        message={`No ${genderNoun}athletes have an individual Nationals cut in ${seasonLabel} yet. The standards are below.`}
      />
    )
  } else if (byEvent) {
    content =
      layout === "list" ? (
        <QualifierEventList groups={eventGroups} splitGender={showGender} currentAthleteId={currentAthleteId} />
      ) : (
        <div className={galleryGridClass}>
          {eventGroups.map((group) => (
            <QualifierEventCard
              key={group.key}
              group={group}
              splitGender={showGender}
              currentAthleteId={currentAthleteId}
            />
          ))}
        </div>
      )
  } else {
    content =
      layout === "list" ? (
        <QualifiersList
          qualifiers={athletes}
          currentAthleteId={currentAthleteId}
          showGender={showGender}
          anchorIds={anchorIds}
        />
      ) : (
        <div className={galleryGridClass}>
          {athletes.map((athlete) => (
            <QualifierGalleryCard
              key={athlete.athleteId}
              athlete={athlete}
              isMe={athlete.athleteId === currentAthleteId}
              showGender={showGender}
              anchorId={anchorIds.get(athlete.athleteId)}
            />
          ))}
        </div>
      )
  }

  return (
    <>
      <FluidToolbar
        pathname="/nationals-qualifiers"
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
            {standards ? (
              <DownloadQualifiersPdfButton season={season} gender={gender} byEvent={byEvent} query={query} />
            ) : null}
            {isCoach ? <UploadStandardsButton season={season} course={standards?.course ?? "SCY"} /> : null}
          </>
        }
      />
      {standards && !isEmpty && !byEvent ? (
        // The A–Z rail sits beside the qualifiers, or out in the page's right margin once that's wide
        // enough (see JumpRail), as on the roster — keep in step with QualifiersSkeleton.
        <div className={JUMP_RAIL_LAYOUT_CLASS}>
          <div className="min-w-0 flex-1">{content}</div>
          <JumpRail label="Jump to letter" items={railItems} />
        </div>
      ) : (
        content
      )}
    </>
  )
}

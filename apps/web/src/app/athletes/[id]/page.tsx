import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import BackLink from "@/components/ui/BackLink"
import StaffBadge from "@/components/ui/StaffBadge"
import { getSession } from "@/lib/auth/session"

function formatYear(year: string): string {
  if (year.toLowerCase().includes("phd")) return "PhD"
  if (year.toLowerCase().includes("master")) return "Masters"
  const num = parseInt(year)
  if (isNaN(num)) return year
  const suffixes = ["th", "st", "nd", "rd"]
  const v = num % 100
  return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]) + " Year"
}

import { compareSwimPb } from "@/lib/swim/swim-parse"
import AddSwimForm from "./AddSwimForm"
import PersonalBestsGrid from "./PersonalBestsGrid"
import SwimHistory from "./SwimHistory"
import RequestTimesImportButton from "@/components/athlete/RequestTimesImportButton"
import AthleteActions from "./AthleteActions"
import PendingProfileChangesReview from "@/components/athlete/PendingProfileChangesReview"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { formatSeasonLabel, isStaffRole } from "@swimbuzz/shared"
import { parsePendingProfileChanges } from "@/lib/athlete/pending-profile-changes"
import { athletePath, isCuid } from "@/lib/slug"
import StatsHighlights from "@/components/ui/StatsHighlights"
import { computeAthleteHighlights } from "@/lib/athlete/athlete-stats"

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
    const { id: param } = await params
    const session = await getSession()
    if (!session) redirect("/signin")

    const athlete = await prisma.athlete.findFirst({
        where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
        include: {
          user: { select: { name: true, email: true, image: true, staffTitle: true } },
          swims: {
            orderBy: { date: "desc" },
            include: { meetRef: { select: { slug: true, season: true, name: true } } }}}})

    if (!athlete) notFound()
    if (athlete.slug && param !== athlete.slug) redirect(athletePath(athlete.slug))

  const isCoach = await isStaffUi(session.user.role)
  const isOwnProfile = athlete.userId === session.user.id
  const isStaff = isStaffRole(session.user.role)
  const pending = parsePendingProfileChanges(athlete.pendingProfileChanges)

  // group PBs by event
  const pbMap = new Map<string, typeof athlete.swims[0]>()
  for (const swim of [...athlete.swims].sort((a, b) => a.timeMs - b.timeMs)) {
    const key = `${swim.event}-${swim.course}`
    if (!pbMap.has(key)) pbMap.set(key, swim)
  }

  const personalBests = [...pbMap.values()].sort(compareSwimPb)

  const historySwims = athlete.swims.map((swim) => ({
    id: swim.id,
    event: swim.event,
    course: swim.course,
    timeMs: swim.timeMs,
    tags: swim.tags ?? "",
    meet: swim.meet ?? "",
    meetId: swim.meetRef ? swim.meetId : null,
    meetSlug: swim.meetRef?.slug ?? null,
    date: swim.date.toISOString(),
    source: swim.source}))

  const athleteHighlights = computeAthleteHighlights(
    athlete.swims.map((swim) => ({
      id: swim.id,
      event: swim.event,
      course: swim.course,
      timeMs: swim.timeMs,
      place: swim.place,
      date: swim.date,
      meetId: swim.meetId ?? null,
      meetRef: swim.meetRef
        ? {
            slug: swim.meetRef.slug,
            season: swim.meetRef.season,
            name: swim.meetRef.name}
        : null})),
    athlete.seasons
  )

  const rosterHref = "/athletes?gender=all"

  return (
    <main className="mx-auto max-w-4xl space-y-8">
      <div>
        <BackLink
          fallbackHref={rosterHref}
          fallbackLabel="Roster"
          className="text-xs text-foreground-tertiary hover:text-foreground"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 font-medium text-primary">
              {athlete.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={athlete.user.image}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span aria-hidden className="text-3xl">
                  {athlete.firstName[0]}
                  {athlete.lastName[0]}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold">
                {athlete.swimCloudId ? (
                  <a
                    href={`https://www.swimcloud.com/swimmer/${athlete.swimCloudId}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    {athlete.firstName} {athlete.lastName}
                  </a>
                ) : (
                  <>
                    {athlete.firstName} {athlete.lastName}
                  </>
                )}
                {athlete.nicknames.length > 0 && (
                  <span className="font-normal text-foreground-secondary">
                    {" "}({athlete.nicknames.join(", ")})
                  </span>
                )}
                {athlete.user?.staffTitle && <StaffBadge title={athlete.user.staffTitle} />}
              </h1>
              <p className="truncate text-sm text-foreground-secondary">{athlete.user?.email}</p>
              {athlete.year && (
                <p className="mt-0.5 text-xs text-foreground-tertiary">
                  {formatYear(athlete.year)}
                </p>
              )}
              {(isStaff || isOwnProfile) && athlete.gtid && (
                <p className="mt-0.5 text-xs text-foreground-tertiary">
                  GTID: {athlete.gtid}
                </p>
              )}
              {(isStaff || isOwnProfile) && athlete.dob && (
                <p className="mt-0.5 text-xs text-foreground-tertiary">
                  DOB: {athlete.dob.toLocaleDateString()}
                </p>
              )}
              {(isStaff || isOwnProfile) && athlete.swimCloudId && (
                <p className="mt-0.5 text-xs text-foreground-tertiary">
                  SwimCloud ID: {athlete.swimCloudId}
                </p>
              )}
            </div>
          </div>
          
          {isCoach ? (
            <AthleteActions
              athleteId={athlete.id}
              firstName={athlete.firstName}
              lastName={athlete.lastName}
              email={athlete.user?.email ?? ""}
              swimCloudId={athlete.swimCloudId ?? null}
              nicknames={athlete.nicknames}
            />
          ) : isOwnProfile ? (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <Link
                href="/settings"
                className="inline-flex border-border items-center gap-1.5 text-xs px-3 py-2 border rounded-lg hover:bg-fill-secondary transition-colors sm:py-1.5"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Edit profile
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {isCoach && pending && (
        <PendingProfileChangesReview
          athleteId={athlete.id}
          pending={pending}
          currentSwimCloudId={athlete.swimCloudId ?? null}
          currentNicknames={athlete.nicknames}
        />
      )}

      {athleteHighlights && (
        <StatsHighlights
          className="w-full"
          title={`${formatSeasonLabel(athleteHighlights.season)} highlights`}
          counters={athleteHighlights.counters}
        />
      )}

      {/* PB grid */}
      <section>
        <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide mb-4">
          Personal bests
        </h2>
        <PersonalBestsGrid swims={personalBests} />
      </section>

      {/* Swim history */}
      <SwimHistory swims={historySwims} isCoach={isCoach} />
      
      {isCoach && (
        <AddSwimForm
          athleteId={athlete.id}
          swimCloudId={athlete.swimCloudId ?? null}
          timesSyncedAt={athlete.timesSyncedAt?.toISOString() ?? null}
        />
      )}

      {!isCoach && isOwnProfile && (
        <section>
          <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide mb-3">
            Import from SwimCloud
          </h2>
          <RequestTimesImportButton
            athleteId={athlete.id}
            hasSwimCloudId={athlete.swimCloudId != null}
            timesSyncedAt={athlete.timesSyncedAt?.toISOString() ?? null}
          />
        </section>
      )}
    </main>
  )
}
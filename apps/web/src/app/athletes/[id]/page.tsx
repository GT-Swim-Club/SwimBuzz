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

import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import type { AthleteSwim } from "@/lib/athlete/swim-history"
import { meetDayRange } from "@/lib/swim/swim-dedup"
import AthleteActions from "./AthleteActions"
import AthleteSwimsWorkspace from "./AthleteSwimsWorkspace"
import { ICON_BUTTON, SwimCloudProfileLink } from "./AthleteIconButton"
import PendingProfileChangesReview from "@/components/athlete/PendingProfileChangesReview"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { DEFAULT_TIME_ZONE, formatSeasonLabel, zonedDayKey } from "@swimbuzz/shared"
import { parsePendingProfileChanges } from "@/lib/athlete/pending-profile-changes"
import { athletePath, isCuid } from "@/lib/slug"
import StatsHighlights from "@/components/ui/StatsHighlights"
import { computeAthleteHighlights } from "@/lib/athlete/athlete-stats"
import { loadRelaySplits } from "@/lib/meet/relay-splits"

/** Season highlights card above the personal bests — hidden for now, coming back later. */
const SHOW_SEASON_HIGHLIGHTS: boolean = false

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
            include: {
              meetRef: {
                select: { slug: true, season: true, name: true, startsAt: true, endsAt: true, timeZone: true, iconUrl: true },
              },
            }}}})

    if (!athlete) notFound()
    if (athlete.slug && param !== athlete.slug) redirect(athletePath(athlete.slug))

  const isCoach = await isStaffUi(session.user.role)
  const isOwnProfile = athlete.userId === session.user.id
  const pending = parsePendingProfileChanges(athlete.pendingProfileChanges)

  const swims: AthleteSwim[] = athlete.swims.map((swim) => ({
    id: swim.id,
    event: swim.event,
    course: swim.course,
    timeMs: swim.timeMs,
    tags: swim.tags ?? "",
    // The linked meet's current name — the swim's own copy is frozen at import and goes stale on rename.
    meet: swim.meetRef?.name ?? swim.meet ?? "",
    meetId: swim.meetRef ? swim.meetId : null,
    meetSlug: swim.meetRef?.slug ?? null,
    meetIconUrl: swim.meetRef?.iconUrl ?? null,
    meetDays: swim.meetRef ? meetDayRange(swim.meetRef) : null,
    date: swim.date.toISOString(),
    source: swim.source}))

  const relaySplits: AthleteSwim[] = (await loadRelaySplits({ athleteIds: [athlete.id] })).map((split) => ({
    id: `relay-split:${split.id}`,
    event: split.event,
    course: split.course,
    timeMs: split.timeMs,
    tags: "",
    meet: split.meet.name,
    meetId: split.meet.id,
    meetSlug: split.meet.slug,
    meetIconUrl: split.meet.iconUrl,
    meetDays: meetDayRange(split.meet),
    date: split.date.toISOString(),
    source: "relay",
    relaySplit: { relayEvent: split.relayEvent, leg: split.leg }}))

  const athleteHighlights = SHOW_SEASON_HIGHLIGHTS && computeAthleteHighlights(
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
  // Other athletes' emails stay private; staff (outside Athlete view) and the athlete themselves see it.
  const meta = [athlete.year && formatYear(athlete.year), (isCoach || isOwnProfile) && athlete.user?.email].filter(Boolean)

  return (
    <main className="flex flex-col gap-6">
      <div>
        <BackLink
          fallbackHref={rosterHref}
          fallbackLabel="Roster"
          className="text-sm font-medium text-foreground-tertiary transition-colors hover:text-foreground"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-[1_1_360px] items-center gap-5">
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
              <h1 className="text-[30px] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground sm:text-[32px]">
                {athlete.firstName} {athlete.lastName}
                {athlete.preferredName && (
                  <span className="font-normal text-foreground-secondary">
                    {" "}({athlete.preferredName})
                  </span>
                )}
                {athlete.user?.staffTitle && <StaffBadge title={athlete.user.staffTitle} />}
              </h1>
              {meta.length > 0 && (
                <p className="mt-1 truncate text-[15px] leading-[22px] text-foreground-secondary sm:text-base">
                  {meta.join(" · ")}
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
              preferredName={athlete.preferredName}
              gtid={athlete.gtid}
              dob={athlete.dob ? zonedDayKey(athlete.dob, DEFAULT_TIME_ZONE) : null}
            />
          ) : (
            (athlete.swimCloudId != null || isOwnProfile) && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {athlete.swimCloudId != null && <SwimCloudProfileLink swimCloudId={athlete.swimCloudId} />}
                {isOwnProfile && (
                  <Link
                    href="/settings"
                    aria-label="Edit profile"
                    className={`${ICON_BUTTON} h-9 w-9`}
                  >
                    <ActionIcon kind="edit" className="h-5 w-5" />
                    <HoverDetail label="Edit profile" />
                  </Link>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {isCoach && pending && (
        <PendingProfileChangesReview
          athleteId={athlete.id}
          pending={pending}
          currentSwimCloudId={athlete.swimCloudId ?? null}
          currentPreferredName={athlete.preferredName}
        />
      )}

      <AthleteSwimsWorkspace
        swims={swims}
        relaySplits={relaySplits}
        isCoach={isCoach}
        isOwnProfile={isOwnProfile}
        athleteId={athlete.id}
        swimCloudId={athlete.swimCloudId ?? null}
        timesSyncedAt={athlete.timesSyncedAt?.toISOString() ?? null}
        highlights={
          athleteHighlights && (
            <StatsHighlights
              key="highlights"
              title={`${formatSeasonLabel(athleteHighlights.season)} highlights`}
              counters={athleteHighlights.counters}
            />
          )
        }
      />
    </main>
  )
}
